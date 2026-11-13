import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { RmaPriority, RmaResponse } from '../../core/models';
import { RmaService } from '../../core/services/rma.service';
import { buildRma } from '../../testing/rma-fixtures';
import { RmaPriorityFieldComponent } from './rma-priority-field.component';

describe('RmaPriorityFieldComponent', () => {
  let fixture: ComponentFixture<RmaPriorityFieldComponent>;
  let calls: Array<[number, RmaPriority]>;
  let response: (priority: RmaPriority) => Observable<RmaResponse>;
  let saved: RmaResponse[];
  let busy: boolean[];

  const RMA = buildRma({ id: 4, code: 'RMA-2026-000004', status: 'TRIAGE', priority: 'MEDIUM' });

  beforeEach(async () => {
    calls = [];
    saved = [];
    busy = [];
    response = (priority) => of({ ...RMA, priority });
    await TestBed.configureTestingModule({
      imports: [RmaPriorityFieldComponent],
      providers: [
        {
          provide: RmaService,
          useValue: { updatePriority: (id: number, priority: RmaPriority) => { calls.push([id, priority]); return response(priority); } }
        }
      ]
    }).compileComponents();
  });

  function mount(options: { rma?: RmaResponse; canEdit?: boolean; disabled?: boolean } = {}): void {
    fixture = TestBed.createComponent(RmaPriorityFieldComponent);
    fixture.componentRef.setInput('rma', options.rma ?? RMA);
    fixture.componentRef.setInput('canEdit', options.canEdit ?? true);
    fixture.componentRef.setInput('disabled', options.disabled ?? false);
    fixture.componentInstance.saved.subscribe((rma: RmaResponse) => saved.push(rma));
    fixture.componentInstance.busyChange.subscribe((value: boolean) => busy.push(value));
    fixture.detectChanges();
  }

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const trigger = () => host().querySelector<HTMLButtonElement>('.custom-select__trigger');
  const option = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('.custom-select__option')].find((item) => text(item.querySelector('.custom-select__name')) === label);
  function choose(label: string): void {
    trigger()!.click();
    fixture.detectChanges();
    option(label)!.click();
    fixture.detectChanges();
  }

  it('shows the current priority with its bars as an action menu trigger', () => {
    mount();
    expect(trigger()).not.toBeNull();
    expect(trigger()!.getAttribute('aria-label')).toBe('Alterar prioridade, atual: Média');
    expect(trigger()!.getAttribute('data-priority')).toBe('MEDIUM');
    expect(trigger()!.querySelector('.priority-bars[data-priority="MEDIUM"]')).not.toBeNull();
    expect(text(trigger()!.querySelector('.custom-select__label'))).toBe('Média');
    expect(host().querySelector('.custom-select--priority')).not.toBeNull();
  });

  it('lists the three levels with bars and marks the current one', () => {
    mount();
    trigger()!.click();
    fixture.detectChanges();
    const options = [...document.querySelectorAll<HTMLButtonElement>('.custom-select__option')];
    expect(options.map((item) => text(item.querySelector('.custom-select__name')))).toEqual(['Alta', 'Média', 'Baixa']);
    expect(options.map((item) => item.querySelector('.priority-bars')?.getAttribute('data-priority'))).toEqual(['HIGH', 'MEDIUM', 'LOW']);
    // The level colour (styles.css, keyed on the option's data-priority) reaches the bars and the label of every option.
    expect(options.map((item) => item.getAttribute('data-priority'))).toEqual(['HIGH', 'MEDIUM', 'LOW']);
    expect(options.every((item) => item.closest('.custom-select--priority') !== null)).toBe(true);
    expect(text(option('Média')!.querySelector('.custom-select__hint'))).toBe('Prioridade atual');
    expect(option('Média')!.classList).toContain('is-selected');
  });

  it('saves right away when a different level is chosen and shows a short notice', () => {
    mount();
    choose('Alta');
    expect(calls).toEqual([[4, 'HIGH']]);
    expect(saved.map((rma) => rma.priority)).toEqual(['HIGH']);
    expect(busy).toEqual([true, false]);
    expect(text(host().querySelector('[role="status"]'))).toBe('Prioridade alterada para Alta');
    expect(host().querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('.modal-overlay, [role="dialog"]')).toBeNull();
  });

  it('does nothing when the current level is chosen again', () => {
    mount();
    choose('Média');
    expect(calls).toEqual([]);
    expect(saved).toEqual([]);
    expect(host().querySelector('[role="status"]')).toBeNull();
  });

  it('keeps the selector disabled while saving', () => {
    const pending = new Subject<RmaResponse>();
    response = () => pending;
    mount();
    choose('Baixa');
    expect(trigger()!.disabled).toBe(true);
    pending.next({ ...RMA, priority: 'LOW' });
    pending.complete();
    fixture.detectChanges();
    expect(trigger()!.disabled).toBe(false);
  });

  it('shows the API error inline and keeps the current value', () => {
    response = () => throwError(() => ({ error: { message: 'Sem permissão para alterar.' } }));
    mount();
    choose('Alta');
    expect(text(host().querySelector('[role="alert"]'))).toBe('Sem permissão para alterar.');
    expect(saved).toEqual([]);
    expect(trigger()!.getAttribute('data-priority')).toBe('MEDIUM');
    expect(host().querySelector('[role="status"]')).toBeNull();
  });

  it('falls back to a generic message when the API gives none', () => {
    response = () => throwError(() => ({}));
    mount();
    choose('Alta');
    expect(text(host().querySelector('[role="alert"]'))).toBe('Não foi possível alterar a prioridade do RMA.');
  });

  it('clears the notice and the error when another RMA is shown', () => {
    mount();
    choose('Alta');
    fixture.componentRef.setInput('rma', buildRma({ id: 5, priority: 'LOW' }));
    fixture.detectChanges();
    expect(host().querySelector('[role="status"]')).toBeNull();
    expect(host().querySelector('[role="alert"]')).toBeNull();
  });

  it.each([
    ['without rma.editar', { canEdit: false }],
    ['for a closed RMA', { rma: { ...RMA, status: 'COMPLETED' as const } }],
    ['for a returned RMA', { rma: { ...RMA, status: 'RETURNED' as const } }]
  ])('shows only the priority tag %s', (_label, options) => {
    mount(options);
    expect(trigger()).toBeNull();
    const tag = host().querySelector('.priority-tag');
    expect(tag?.getAttribute('data-priority')).toBe('MEDIUM');
    expect(tag?.querySelector('.priority-bars')).not.toBeNull();
    expect(text(tag)).toBe('Média');
  });

  it('blocks the selector while the host is writing something else', () => {
    mount({ disabled: true });
    expect(trigger()!.disabled).toBe(true);
  });
});
