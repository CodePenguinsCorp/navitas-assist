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
      deadline: { status: dueDate ? 'ON_TRACK' : 'NO_DUE_DATE', dueSoonFrom: dueDate ? shift(dueDate, -7) : null },
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

  it('mostra o prazo em dia e omite sem data ou encerrada', () => {
    const chip = render(withDue('2026-12-30'));
    expect(chip?.textContent?.trim()).toBe('Prazo 30/12');
    expect(chip?.getAttribute('data-deadline')).toBe('ON_TRACK');
    expect(chip?.querySelector('app-icon svg')).not.toBeNull();
    expect(render(withDue(null))).toBeNull();
    expect(render(withDue('2026-11-01', { status: 'COMPLETED', deadline: { status: 'CLOSED', dueSoonFrom: '2026-10-25' } }))).toBeNull();
  });

  it('shows Atrasado há 2 dias with its state', () => {
    const chip = render(withDue('2026-11-11'));
    expect(chip?.textContent?.trim()).toBe('Atrasado há 2 dias (11/11)');
    expect(chip?.getAttribute('data-deadline')).toBe('OVERDUE');
    expect(chip?.querySelector('app-icon svg')).not.toBeNull();
  });

  it('shows Perto do limite on the card and every state in detail', () => {
    expect(render(withDue('2026-11-16'))?.getAttribute('data-deadline')).toBe('DUE_SOON');
    expect(render(withDue('2026-11-16'))?.textContent?.trim()).toBe('Vence em 3 dias (16/11)');
    expect(render(withDue('2026-12-30'), 'detail')?.textContent?.trim()).toBe('No prazo');
    expect(render(withDue(null), 'detail')?.textContent?.trim()).toBe('Sem data limite');
  });

  it('mostra vencimento em um dia e inclui o ano quando diferente do ano de negócio', () => {
    expect(render(withDue('2026-11-14'))?.textContent?.trim()).toBe('Vence em 1 dia (14/11)');
    expect(render(withDue('2027-01-02'))?.textContent?.trim()).toBe('Prazo 02/01/2027');
  });

  it.each(['COMPLETED', 'RETURNED', 'IRREPARABLE'] as const)('omite prazo na OS %s', (status) => {
    expect(render(withDue('2026-11-01', { status }))).toBeNull();
    expect(render(withDue('2026-11-01', { status }), 'detail')).toBeNull();
  });

  it.each([
    ['2026-11-11', 'OVERDUE', 'Atrasado há 2 dias (11/11)'],
    ['2026-11-13', 'DUE_SOON', 'Vence hoje (13/11)'],
    ['2026-11-14', 'DUE_SOON', 'Vence em 1 dia (14/11)'],
    ['2026-12-30', 'ON_TRACK', 'Prazo 30/12'],
  ])('mostra relógio, texto e estado para %s', (date, tone, text) => {
    const chip = render(withDue(date));
    expect(chip?.textContent?.trim()).toBe(text);
    expect(chip?.getAttribute('data-deadline')).toBe(tone);
    expect(chip?.querySelector('app-icon')?.getAttribute('name')).toBe('clock');
    expect(chip?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('turns overdue at São Paulo midnight as the clock advances', () => {
    clock.set(Date.parse('2026-11-14T02:59:00Z'));
    const rma = withDue('2026-11-13');
    expect(render(rma)?.textContent?.trim()).toBe('Vence hoje (13/11)');
    clock.set(Date.parse('2026-11-14T03:01:00Z'));
    fixture.detectChanges();
    const chip = (fixture.nativeElement as HTMLElement).querySelector('.deadline-chip');
    expect(chip?.textContent?.trim()).toBe('Atrasado há 1 dia (13/11)');
    expect(chip?.getAttribute('data-deadline')).toBe('OVERDUE');
    expect(chip?.querySelector('app-icon svg')).not.toBeNull();
  });
});
