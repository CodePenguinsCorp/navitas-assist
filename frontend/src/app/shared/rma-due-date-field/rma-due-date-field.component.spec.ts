import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { RmaResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { RmaService } from '../../core/services/rma.service';
import { buildRma } from '../../testing/rma-fixtures';
import { RmaDueDateFieldComponent } from './rma-due-date-field.component';

describe('RmaDueDateFieldComponent', () => {
  let fixture: ComponentFixture<RmaDueDateFieldComponent>;
  let calls: Array<[number, string | null]>;
  let response: () => ReturnType<RmaService['updateDueDate']>;
  let saved: RmaResponse[];

  const RMA = buildRma({ id: 4, code: 'OS-2026-000004', entryDate: '2026-11-02', dueDate: '2026-11-20', deadline: { status: 'ON_TRACK', dueSoonFrom: '2026-11-13' } });

  beforeEach(async () => {
    calls = [];
    saved = [];
    response = () => of({ ...RMA, dueDate: '2026-11-25' });
    await TestBed.configureTestingModule({
      imports: [RmaDueDateFieldComponent],
      providers: [
        { provide: ClockService, useValue: { now: signal(Date.parse('2026-11-10T12:00:00Z')) } },
        { provide: RmaService, useValue: { updateDueDate: (id: number, dueDate: string | null) => { calls.push([id, dueDate]); return response(); } } }
      ]
    }).compileComponents();
  });

  function mount(options: { rma?: RmaResponse; canEdit?: boolean; disabled?: boolean } = {}): void {
    fixture = TestBed.createComponent(RmaDueDateFieldComponent);
    fixture.componentRef.setInput('rma', options.rma ?? RMA);
    fixture.componentRef.setInput('canEdit', options.canEdit ?? true);
    fixture.componentRef.setInput('disabled', options.disabled ?? false);
    fixture.componentInstance.saved.subscribe((rma: RmaResponse) => saved.push(rma));
    render();
  }

  function render(): void {
    fixture.detectChanges();
    TestBed.tick();
  }

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const trigger = () => host().querySelector<HTMLButtonElement>('button.date-picker__trigger');
  const open = () => { trigger()!.click(); render(); };
  const day = (label: string) => [...host().querySelectorAll<HTMLButtonElement>('button.date-picker__day:not(.is-outside)')].find((item) => text(item) === label);
  const action = (label: string) => [...host().querySelectorAll<HTMLButtonElement>('button.date-picker__footer-action')].find((item) => text(item) === label);

  it('shows the shared picker with the current value and the deadline chip', () => {
    mount();
    expect(host().querySelector('input[type="date"]')).toBeNull();
    expect(text(trigger())).toContain('20/11/2026');
    expect(trigger()!.getAttribute('aria-label')).toBe('Data limite');
    expect(host().querySelector('.deadline-chip')).not.toBeNull();
  });

  it('shows Sem data limite when empty', () => {
    mount({ rma: { ...RMA, dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null } } });
    expect(text(trigger())).toContain('Sem data limite');
  });

  it('shows plain text without a picker when the user cannot edit', () => {
    mount({ canEdit: false });
    expect(host().querySelector('button')).toBeNull();
    expect(text(host())).toContain('20/11/2026');
  });

  it('keeps the picker inactive while the host is busy', () => {
    mount({ disabled: true });
    expect(trigger()!.disabled).toBe(true);
  });

  it('opens the calendar without Cancelar/Salvar buttons and disables days before the entry', () => {
    mount();
    open();
    expect([...host().querySelectorAll('button')].map((item) => text(item))).not.toContain('Salvar');
    expect([...host().querySelectorAll('button')].map((item) => text(item))).not.toContain('Cancelar');
    expect(host().querySelector('.date-picker__panel')).not.toBeNull();
  });

  it('saves once when a day is chosen and emits the OS', () => {
    mount();
    open();
    day('25')!.click();
    render();
    expect(calls).toEqual([[4, '2026-11-25']]);
    expect(saved.map((rma) => rma.dueDate)).toEqual(['2026-11-25']);
    expect(host().querySelector('.date-picker__panel')).toBeNull();
  });

  it('removes the date with Limpar and saves null (clearDueDate)', () => {
    mount();
    open();
    action('Limpar')!.click();
    render();
    expect(calls).toEqual([[4, null]]);
  });

  it('does not save when the same date is chosen again', () => {
    mount();
    open();
    day('20')!.click();
    render();
    expect(calls).toEqual([]);
  });

  it('does not allow a date before the entry', () => {
    mount();
    open();
    expect(day('1')!.disabled).toBe(true);
    day('1')!.click();
    render();
    expect(calls).toEqual([]);
  });

  it('shows the server error inline and restores the previous value', () => {
    response = () => throwError(() => ({ status: 400, error: { message: 'Data inválida.' } }));
    mount();
    open();
    day('25')!.click();
    render();
    expect(text(host().querySelector('[role="alert"]'))).toContain('Data inválida.');
    expect(text(trigger())).toContain('20/11/2026');
    expect(saved).toEqual([]);
  });

  it('reports pending writes until completion and ignores picks while saving', () => {
    const pending = new Subject<RmaResponse>();
    response = () => pending.asObservable();
    const busy: boolean[] = [];
    mount();
    fixture.componentInstance.busyChange.subscribe((value: boolean) => busy.push(value));
    open();
    day('25')!.click();
    render();
    expect(busy).toEqual([true]);
    expect(trigger()!.disabled).toBe(true);
    pending.next({ ...RMA, dueDate: '2026-11-25' });
    pending.complete();
    render();
    expect(busy).toEqual([true, false]);
    expect(calls).toEqual([[4, '2026-11-25']]);
  });
});
