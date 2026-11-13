import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaResponse } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { RmaStageTimesComponent } from './rma-stage-times.component';

describe('RmaStageTimesComponent', () => {
  let fixture: ComponentFixture<RmaStageTimesComponent>;

  beforeEach(async () => {
    const clock = signal(Date.parse('2026-11-13T12:00:00Z'));
    await TestBed.configureTestingModule({
      imports: [RmaStageTimesComponent],
      providers: [{ provide: SlaClockService, useValue: { now: clock.asReadonly() } }]
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
});
