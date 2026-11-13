import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { RmaStageTimesComponent } from './rma-stage-times.component';

describe('RmaStageTimesComponent', () => {
  let fixture: ComponentFixture<RmaStageTimesComponent>;

  beforeEach(async () => {
    const clock = signal(Date.parse('2026-11-13T12:00:00Z'));
    await TestBed.configureTestingModule({
      imports: [RmaStageTimesComponent],
      providers: [{ provide: ClockService, useValue: { now: clock.asReadonly() } }]
    }).compileComponents();
    fixture = TestBed.createComponent(RmaStageTimesComponent);
  });

  function lines(rma: Pick<RmaResponse, 'status' | 'stagePeriods'>): string[] {
    fixture.componentRef.setInput('rma', rma);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('section')?.getAttribute('aria-label')).toBe('Tempo por etapa');
    return [...element.querySelectorAll('li')].map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  it('lists every period in order and marks only the current one', () => {
    expect(lines({
      status: 'IN_DIAGNOSIS',
      stagePeriods: [
        { status: 'RECEIVED', enteredAt: '2026-11-10T10:00:00Z', leftAt: '2026-11-10T12:00:00Z', durationSeconds: 7200 },
        { status: 'TRIAGE', enteredAt: '2026-11-10T12:00:00Z', leftAt: '2026-11-11T12:30:00Z', durationSeconds: 88200 },
        { status: 'IN_DIAGNOSIS', enteredAt: '2026-11-11T12:30:00Z', leftAt: null, durationSeconds: 0 }
      ]
    })).toEqual(['Recebido · 2 h', 'Triagem · 1 d', 'Diagnóstico · 1 d 23 h (atual)']);
  });

  it('shows Encerrado em on the last line of a closed RMA', () => {
    const rendered = lines({
      status: 'COMPLETED',
      stagePeriods: [
        { status: 'IN_TESTS', enteredAt: '2026-11-10T10:00:00Z', leftAt: '2026-11-10T13:00:00Z', durationSeconds: 10800 },
        { status: 'COMPLETED', enteredAt: '2026-11-10T13:00:00Z', leftAt: null, durationSeconds: 0 }
      ]
    });
    expect(rendered[0]).toBe('Testes · 3 h');
    expect(rendered[1]).toBe('Concluído · Encerrado em 10/11/2026 10:00');
    expect(rendered.join(' ')).not.toContain('(atual)');
  });

  it('draws one proportional bar segment per stage with the total and a hover tip', () => {
    fixture.componentRef.setInput('rma', {
      status: 'IN_DIAGNOSIS',
      stagePeriods: [
        { status: 'RECEIVED', enteredAt: '2026-11-10T10:00:00Z', leftAt: '2026-11-10T12:00:00Z', durationSeconds: 7200 },
        { status: 'IN_DIAGNOSIS', enteredAt: '2026-11-10T12:00:00Z', leftAt: null, durationSeconds: 0 }
      ]
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const segments = [...element.querySelectorAll<HTMLElement>('.stage-times__segment')];
    expect(segments.map((segment) => segment.dataset['tip'])).toEqual(['Recebido · 2 h', 'Diagnóstico · 3 d (atual)']);
    expect(segments.map((segment) => segment.dataset['status'])).toEqual(['RECEIVED', 'IN_DIAGNOSIS']);
    expect(Number(segments[1].style.flexGrow)).toBeGreaterThan(Number(segments[0].style.flexGrow));
    expect(element.querySelector('.stage-times__total')?.textContent?.trim()).toBe('3 d 2 h');
  });
});
