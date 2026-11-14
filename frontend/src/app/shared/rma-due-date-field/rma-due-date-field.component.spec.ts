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

  const RMA = buildRma({ id: 4, code: 'OS-2026-000004', entryDate: '2026-11-02', dueDate: '2026-11-20', deadline: { status: 'ON_TRACK', dueSoonFrom: '2026-11-13', daysUntilDue: 10 } });

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
  const trigger = () => host().querySelector<HTMLButtonElement>('button.due-date-field__trigger');
  const input = () => host().querySelector<HTMLInputElement>('input[type="date"]');
  const button = (label: string) => [...host().querySelectorAll<HTMLButtonElement>('button')].find((item) => text(item) === label || item.getAttribute('aria-label') === label);
  const edit = () => { trigger()!.click(); render(); };
  const type = (value: string) => { input()!.value = value; input()!.dispatchEvent(new Event('input')); render(); };
  const submit = () => { host().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); render(); };

  it('shows the value as a borderless clickable trigger with a calendar icon and no Alterar button', () => {
    mount();
    expect(button('Alterar')).toBeUndefined();
    expect(trigger()).not.toBeNull();
    expect(trigger()!.className).not.toContain('button-secondary');
    expect(trigger()!.querySelector('app-icon')).not.toBeNull();
    expect(text(trigger())).toContain('20/11/2026');
    expect(trigger()!.querySelector('.deadline-chip')).not.toBeNull();
    expect(trigger()!.hasAttribute('aria-label')).toBe(false);
    expect(text(trigger()!.querySelector('.sr-only'))).toBe('Alterar data limite');
  });

  it('shows Sem data limite in the muted empty state', () => {
    mount({ rma: { ...RMA, dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null, daysUntilDue: null } } });
    expect(text(trigger()!.querySelector('.due-date-field__text'))).toBe('Sem data limite');
    expect(trigger()!.classList).toContain('is-empty');
  });

  it('shows plain text without a trigger when the user cannot edit', () => {
    mount({ canEdit: false });
    expect(trigger()).toBeNull();
    expect(host().querySelector('button')).toBeNull();
    expect(text(host())).toContain('20/11/2026');
  });

  it('keeps the trigger inactive while the host is busy', () => {
    mount({ disabled: true });
    expect(trigger()!.disabled).toBe(true);
  });

  it('opens an inline date field focused on the current value with the entry date as minimum', () => {
    mount();
    edit();
    expect(host().querySelector('[role="dialog"], app-rma-due-date-dialog')).toBeNull();
    expect(input()!.closest('.field-group')).not.toBeNull();
    expect(input()!.value).toBe('2026-11-20');
    expect(input()!.min).toBe('2026-11-02');
    expect(input()!.getAttribute('aria-label')).toBe('Data limite');
    expect(document.activeElement).toBe(input());
    expect([...host().querySelectorAll('.due-date-field__actions button')].map(text)).toEqual(['Cancelar', 'Salvar']);
  });

  it('saves the chosen date, emits the OS and returns focus to the trigger', () => {
    mount();
    edit();
    type('2026-11-25');
    submit();
    expect(calls).toEqual([[4, '2026-11-25']]);
    expect(saved.map((rma) => rma.dueDate)).toEqual(['2026-11-25']);
    expect(input()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('clears with the x button and saves null (clearDueDate)', () => {
    mount();
    edit();
    button('Limpar data limite')!.click();
    render();
    expect(input()!.value).toBe('');
    expect(document.activeElement).toBe(input());
    submit();
    // RmaService.updateDueDate turns null into { clearDueDate: true } (rma.service.spec.ts).
    expect(calls).toEqual([[4, null]]);
  });

  it('closes without a request when the value did not change', () => {
    mount();
    edit();
    submit();
    expect(calls).toEqual([]);
    expect(input()).toBeNull();
  });

  it('blocks a date before the entry without a request', () => {
    mount();
    edit();
    type('2026-11-01');
    submit();
    expect(calls).toEqual([]);
    const error = host().querySelector<HTMLElement>('.field-error[role="alert"]')!;
    expect(text(error)).toBe('A data limite não pode ser anterior à entrada.');
    expect(input()!.getAttribute('aria-invalid')).toBe('true');
    expect(input()!.getAttribute('aria-describedby')).toBe(error.id);
  });

  it('shows the server error and keeps the field open', () => {
    response = () => throwError(() => ({ error: { message: 'Due date cannot be before entry date.' } }));
    mount();
    edit();
    type('2026-11-25');
    submit();
    expect(text(host().querySelector('[role="alert"]'))).toBe('Due date cannot be before entry date.');
    expect(saved).toEqual([]);
    expect(input()).not.toBeNull();

    response = () => throwError(() => ({}));
    submit();
    expect(text(host().querySelector('[role="alert"]'))).toBe('Não foi possível salvar a data limite.');
  });

  it('Cancelar closes without a request and returns focus to the trigger', () => {
    mount();
    edit();
    type('2026-11-25');
    button('Cancelar')!.click();
    render();
    expect(input()).toBeNull();
    expect(calls).toEqual([]);
    expect(document.activeElement).toBe(trigger());
  });

  it('Escape cancels the edit and is consumed before the detail sees it', () => {
    mount();
    edit();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input()!.dispatchEvent(escape);
    render();
    expect(escape.defaultPrevented).toBe(true);
    expect(input()).toBeNull();
  });

  it('shows Salvando... and locks the field while saving', () => {
    const pending = new Subject<RmaResponse>();
    response = () => pending;
    mount();
    edit();
    type('2026-11-25');
    submit();
    expect(text(button('Salvando...'))).toBe('Salvando...');
    expect(button('Salvando...')!.disabled).toBe(true);
    expect(button('Cancelar')!.disabled).toBe(true);
    expect(input()!.disabled).toBe(true);
    pending.next({ ...RMA, dueDate: '2026-11-25' });
    pending.complete();
    render();
    expect(input()).toBeNull();
  });
});
