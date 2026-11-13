import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { buildRma } from '../../testing/rma-fixtures';
import { RmaDeadlineChipComponent } from './rma-deadline-chip.component';

describe('RmaDeadlineChipComponent', () => {
  let fixture: ComponentFixture<RmaDeadlineChipComponent>;
  let clock: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    clock = signal(Date.parse('2026-11-13T15:00:00Z'));
    await TestBed.configureTestingModule({
      imports: [RmaDeadlineChipComponent],
      providers: [{ provide: ClockService, useValue: { now: clock.asReadonly() } }]
    }).compileComponents();
    fixture = TestBed.createComponent(RmaDeadlineChipComponent);
  });

  function withDue(dueDate: string | null, overrides: Partial<RmaResponse> = {}): RmaResponse {
    return buildRma({
      status: 'IN_REPAIR',
      dueDate,
      deadline: { status: dueDate ? 'ON_TRACK' : 'NO_DUE_DATE', dueSoonFrom: dueDate ? shift(dueDate, -7) : null, daysUntilDue: null },
      ...overrides
    });
  }

  function shift(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }

  function render(rma: RmaResponse, mode: 'card' | 'detail' = 'card'): HTMLElement | null {
    fixture.componentRef.setInput('rma', rma);
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.deadline-chip');
  }

  it('hides on the card when on track, without due date or closed', () => {
    expect(render(withDue('2026-12-30'))).toBeNull();
    expect(render(withDue(null))).toBeNull();
    expect(render(withDue('2026-11-01', { status: 'COMPLETED', deadline: { status: 'CLOSED', dueSoonFrom: '2026-10-25', daysUntilDue: null } }))).toBeNull();
  });

  it('shows Atrasado há 2 dias with its state', () => {
    const chip = render(withDue('2026-11-11'));
    expect(chip?.textContent?.trim()).toBe('Atrasado há 2 dias');
    expect(chip?.getAttribute('data-deadline')).toBe('OVERDUE');
  });

  it('shows Perto do limite on the card and every state in detail', () => {
    expect(render(withDue('2026-11-16'))?.getAttribute('data-deadline')).toBe('DUE_SOON');
    expect(render(withDue('2026-11-16'))?.textContent?.trim()).toBe('Vence em 3 dias');
    expect(render(withDue('2026-12-30'), 'detail')?.textContent?.trim()).toBe('No prazo');
    expect(render(withDue(null), 'detail')?.textContent?.trim()).toBe('Sem data limite');
  });

  it('turns overdue at São Paulo midnight as the clock advances', () => {
    clock.set(Date.parse('2026-11-14T02:59:00Z'));
    const rma = withDue('2026-11-13');
    expect(render(rma)?.textContent?.trim()).toBe('Vence hoje');
    clock.set(Date.parse('2026-11-14T03:01:00Z'));
    fixture.detectChanges();
    const chip = (fixture.nativeElement as HTMLElement).querySelector('.deadline-chip');
    expect(chip?.textContent?.trim()).toBe('Atrasado há 1 dia');
    expect(chip?.getAttribute('data-deadline')).toBe('OVERDUE');
  });
});
