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

  it('draws one proportional bar segment per stage with the total', () => {
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
    expect(segments.map((segment) => segment.dataset['status'])).toEqual(['RECEIVED', 'IN_DIAGNOSIS']);
    expect(Number(segments[1].style.flexGrow)).toBeGreaterThan(Number(segments[0].style.flexGrow));
    expect(element.querySelector('.stage-times__total')?.textContent?.trim()).toBe('3 d 2 h');
  });

  it('keeps the per-stage list collapsed until the arrow is used, then shows colour, name and time of every stage', () => {
    fixture.componentRef.setInput('rma', {
      status: 'IN_REPAIR',
      stagePeriods: [
        { status: 'RECEIVED', enteredAt: '2026-11-10T00:00:00Z', leftAt: '2026-11-12T00:00:00Z', durationSeconds: 172800 },
        { status: 'TRIAGE', enteredAt: '2026-11-12T00:00:00Z', leftAt: '2026-11-12T00:10:00Z', durationSeconds: 600 },
        { status: 'IN_REPAIR', enteredAt: '2026-11-12T00:10:00Z', leftAt: null, durationSeconds: 0 }
      ]
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.stage-times__toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.stage-times__list')).toBeNull();
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const rows = [...element.querySelectorAll('.stage-times__list li')].map((item) => [
      item.getAttribute('data-status'),
      item.querySelector('.stage-times__name')?.textContent?.trim(),
      item.querySelector('.stage-times__value')?.textContent?.trim()
    ]);
    expect(rows).toEqual([
      ['RECEIVED', 'Recebido', '2 d'],
      ['TRIAGE', 'Triagem', '10 min'],
      ['IN_REPAIR', 'Reparo', '1 d 11 h (atual)']
    ]);
    toggle.click();
    fixture.detectChanges();
    expect(element.querySelector('.stage-times__list')).toBeNull();
  });
});
