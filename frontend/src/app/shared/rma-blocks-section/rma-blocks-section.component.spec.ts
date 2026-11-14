import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaBlockResponse, RmaResponse } from '../../core/models';
import { Permission } from '../../core/permissions';
import { ClockService } from '../../core/services/clock.service';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { RmaBlocksSectionComponent } from './rma-blocks-section.component';

const NOW = Date.parse('2026-10-20T12:00:00Z');

describe('RmaBlocksSectionComponent', () => {
  let fixture: ComponentFixture<RmaBlocksSectionComponent>;
  let http: HttpTestingController;
  const role = signal<LegacyProfileCode | readonly Permission[]>('TECHNICIAN');

  beforeEach(async () => {
    role.set('TECHNICIAN');
    await TestBed.configureTestingModule({
      imports: [RmaBlocksSectionComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ClockService, useValue: { now: signal(NOW) } },
        providePermissions(computed(() => { const access = role(); return typeof access === 'string' ? profilePermissions(access) : access; }))
      ]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function mount(rma: RmaResponse = RMA, disabled = false): HTMLElement {
    fixture = TestBed.createComponent(RmaBlocksSectionComponent);
    fixture.componentRef.setInput('rma', rma);
    fixture.componentRef.setInput('disabled', disabled);
    render();
    return fixture.nativeElement as HTMLElement;
  }

  function render(): void {
    fixture.detectChanges();
    TestBed.tick();
  }

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const control = (label: string) =>
    [...host().querySelectorAll<HTMLButtonElement>('button')].find((button) => text(button) === label || text(button).startsWith(label));
  const form = () => host().querySelector<HTMLFormElement>('form');
  const setField = (name: string, value: string) => {
    const input = form()!.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[formControlName="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    render();
    return input;
  };
  const submit = () => { form()!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); render(); };
  const blocked = (extra: Partial<RmaResponse> = {}): RmaResponse => ({ ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK], ...extra });

  it.each([false, true])('não envia um formulário já aberto quando outra ação bloqueia o detalhe (resolver: %s)', resolving => {
    mount(resolving ? blocked() : RMA);
    control(resolving ? 'Resolver' : 'Sinalizar impedimento')!.click(); render();
    setField(resolving ? 'resolutionNote' : 'reason', 'Justificativa');
    fixture.componentRef.setInput('disabled', true); render();
    expect(form()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    submit();
    http.expectNone(request => request.method === 'POST' || request.method === 'PATCH');
    expect(form()).not.toBeNull();
  });

  it('shows Sem impedimento with a quiet Sinalizar impedimento action and no form until asked', () => {
    mount();
    expect(text(host().querySelector('.blocks-section__empty'))).toBe('Sem impedimento');
    const flag = control('Sinalizar impedimento')!;
    expect(flag.classList).toContain('link-button');
    expect(flag.className).not.toContain('button-secondary');
    expect(form()).toBeNull();
    expect(host().querySelector('dialog')).toBeNull();
  });

  it('expands reason and category inline, focuses the reason and blocks with trimmed values', () => {
    const updated: RmaResponse[] = [];
    mount();
    fixture.componentInstance.updated.subscribe((rma) => updated.push(rma));
    const flag = control('Sinalizar impedimento')!;
    flag.click();
    render();
    expect(flag.getAttribute('aria-expanded')).toBe('true');
    const reason = form()!.querySelector('[formControlName="reason"]');
    expect(document.activeElement).toBe(reason);
    expect(form()!.querySelector('[formControlName="category"]')).not.toBeNull();
    expect([...form()!.querySelectorAll('.form-actions button')].map(text)).toEqual(['Cancelar', 'Bloquear']);
    setField('reason', '  Aguardando peça  ');
    setField('category', '  Peças  ');
    submit();
    const request = http.expectOne('/api/rmas/1/blocks');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Aguardando peça', category: 'Peças' });
    request.flush(blocked());
    render();
    expect(updated).toHaveLength(1);
    expect(form()).toBeNull();
    expect(text(host().querySelector('.blocks-section__current'))).toContain('Peça pendente');
  });

  it('sends a null category when it is left blank', () => {
    mount();
    control('Sinalizar impedimento')!.click();
    render();
    setField('reason', 'Peça pendente');
    submit();
    const request = http.expectOne('/api/rmas/1/blocks');
    expect(request.request.body).toEqual({ reason: 'Peça pendente', category: null });
    request.flush(blocked());
  });

  it('Cancelar collapses the form without a write and returns focus to the trigger', () => {
    mount();
    const flag = control('Sinalizar impedimento')!;
    flag.click();
    render();
    setField('reason', 'Rascunho');
    control('Cancelar')!.click();
    render();
    expect(form()).toBeNull();
    expect(document.activeElement).toBe(control('Sinalizar impedimento'));
    http.expectNone((request) => request.method === 'POST' || request.method === 'PATCH');
  });

  it('Escape inside the inline form cancels it and is consumed before the detail sees it', () => {
    mount();
    control('Sinalizar impedimento')!.click();
    render();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    form()!.querySelector('textarea')!.dispatchEvent(escape);
    render();
    expect(escape.defaultPrevented).toBe(true);
    expect(form()).toBeNull();
  });

  it('shows the current block in a warning card with reason, category, author and duration', () => {
    mount(blocked());
    const card = host().querySelector('.blocks-section__current')!;
    expect(text(card.querySelector('strong'))).toBe('Impedida há 2 h');
    expect(text(card)).toContain('Peça pendente');
    expect(text(card)).toContain('Peças');
    expect(text(card)).toContain('tech');
    expect(host().querySelector('.blocks-section__empty')).toBeNull();
    expect(control('Sinalizar impedimento')).toBeUndefined();
  });

  it('Resolver expands a required resolution note with Cancelar before Desbloquear and resolves the episode', () => {
    const updated: RmaResponse[] = [];
    mount(blocked());
    fixture.componentInstance.updated.subscribe((rma) => updated.push(rma));
    control('Resolver')!.click();
    render();
    const note = form()!.querySelector('[formControlName="resolutionNote"]');
    expect(document.activeElement).toBe(note);
    expect([...form()!.querySelectorAll('.form-actions button')].map(text)).toEqual(['Cancelar', 'Desbloquear']);
    submit();
    http.expectNone('/api/rmas/1/blocks/9');
    setField('resolutionNote', '  Peça recebida  ');
    submit();
    const request = http.expectOne('/api/rmas/1/blocks/9');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ resolutionNote: 'Peça recebida' });
    request.flush({ ...RMA, blockHistory: [{ ...BLOCK, resolvedBy: 'desk', resolvedAt: '2026-10-20T11:30:00Z', resolutionNote: 'Peça recebida' }] });
    render();
    expect(updated[0].currentBlock).toBeNull();
    expect(text(host().querySelector('.blocks-section__empty'))).toBe('Sem impedimento');
  });

  it.each([
    { field: 'reason', value: '', expected: 'Informe o motivo do impedimento.' },
    { field: 'reason', value: '   ', expected: 'Informe o motivo do impedimento.' },
    { field: 'reason', value: 'x'.repeat(1001), expected: 'Use até 1000 caracteres.' },
    { field: 'category', value: 'x'.repeat(81), expected: 'Use até 80 caracteres.' },
    { field: 'resolutionNote', value: '', expected: 'Informe a nota de resolução.' },
    { field: 'resolutionNote', value: '   ', expected: 'Informe a nota de resolução.' },
    { field: 'resolutionNote', value: 'x'.repeat(1001), expected: 'Use até 1000 caracteres.' }
  ])('shows validation beside $field ($expected)', ({ field, value, expected }) => {
    const resolving = field === 'resolutionNote';
    mount(resolving ? blocked() : RMA);
    control(resolving ? 'Resolver' : 'Sinalizar impedimento')!.click();
    render();
    if (field === 'category') setField('reason', 'Aguardando peça');
    const input = setField(field, value);
    submit();
    const group = input.closest('.field-group')!;
    expect(group.textContent).toContain(expected);
    const error = group.querySelector<HTMLElement>('[role="alert"]')!;
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(host().querySelector('p.field-error[role="alert"]')).toBeNull();
    http.expectNone((request) => request.method === 'POST' || request.method === 'PATCH');
    setField(field, 'Texto válido');
    expect(group.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([
    { isBlocked: false, message: 'A OS já está impedida.', expected: 'A OS já foi bloqueada. Feche e abra o detalhe para atualizar.' },
    { isBlocked: true, message: 'O impedimento da OS não está mais ativo.', expected: 'Este impedimento já foi resolvido. Feche e abra o detalhe para atualizar.' },
    { isBlocked: false, message: 'Gravação recusada', expected: 'Gravação recusada' }
  ])('keeps values and shows the server message (blocked=$isBlocked, $message)', ({ isBlocked, message, expected }) => {
    mount(isBlocked ? blocked() : RMA);
    control(isBlocked ? 'Resolver' : 'Sinalizar impedimento')!.click();
    render();
    const input = setField(isBlocked ? 'resolutionNote' : 'reason', '  Texto preservado  ');
    submit();
    const request = http.expectOne(isBlocked ? '/api/rmas/1/blocks/9' : '/api/rmas/1/blocks');
    expect(input.disabled).toBe(true);
    expect(control('Cancelar')!.disabled).toBe(true);
    expect(text(form()!.querySelector('[type="submit"]'))).toBe('Salvando...');
    request.flush({ message }, { status: 400, statusText: 'Bad Request' });
    render();
    expect(text(host().querySelector('.blocks-section__error[role="alert"]'))).toBe(expected);
    expect(input.value).toBe('  Texto preservado  ');
    expect(input.disabled).toBe(false);
    expect(control('Cancelar')!.disabled).toBe(false);
  });

  it.each((['ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER'] as LegacyProfileCode[]).flatMap((profile) => [false, true].map((isBlocked) => ({ profile, isBlocked }))))(
    'offers write actions only with rma.impedimentos ($profile, blocked=$isBlocked)',
    ({ profile, isBlocked }) => {
      role.set(profile);
      mount(isBlocked ? blocked() : RMA);
      expect(control(isBlocked ? 'Resolver' : 'Sinalizar impedimento') !== undefined).toBe(profile !== 'VIEWER');
    }
  );

  it.each([
    { permissions: ['rma.ver', 'rma.impedimentos'] as Permission[], editable: true },
    { permissions: profilePermissions('ADMIN').filter((permission) => permission !== 'rma.impedimentos'), editable: false }
  ])('follows rma.impedimentos alone (editable=$editable)', ({ permissions, editable }) => {
    role.set(permissions);
    mount();
    expect(control('Sinalizar impedimento') !== undefined).toBe(editable);
  });

  it('disables the inline actions while the detail is busy', () => {
    mount(RMA, true);
    expect(control('Sinalizar impedimento')!.disabled).toBe(true);
  });

  it('keeps previous episodes collapsed under Histórico (N) and expands them on demand', () => {
    const previous: RmaBlockResponse = { ...BLOCK, id: 4, reason: 'Bloqueio anterior', resolvedBy: 'desk', resolvedAt: '2026-10-19T12:00:00Z', resolutionNote: 'Resolvido anteriormente' };
    mount(blocked({ blockHistory: [BLOCK, previous] }));
    const toggle = control('Histórico')!;
    expect(text(toggle)).toBe('Histórico (1)');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(text(host())).not.toContain('Resolvido anteriormente');
    toggle.click();
    render();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const list = host().querySelector('app-rma-block-history')!;
    expect(text(list)).toContain('Resolvido anteriormente');
    expect(text(list)).not.toContain('Peça pendente');
    expect(list.querySelector('h3')).toBeNull();
  });

  it('omits the history toggle when there is no previous episode', () => {
    mount(blocked());
    expect(control('Histórico')).toBeUndefined();
  });
});

const BLOCK: RmaBlockResponse = { id: 9, reason: 'Peça pendente', category: 'Peças', blockedBy: 'tech', blockedAt: '2026-10-20T10:00:00Z', resolvedBy: null, resolvedAt: null, resolutionNote: null };
const RMA: RmaResponse = {
  id: 1, code: 'OS-2026-000001', clientId: 1, clientName: 'Cliente', items: [], productId: 1, productName: 'Produto', productSku: 'P1', batchNumber: 'L1', serialNumber: null, manufacturedAt: null,
  purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-10-20', invoiceNumber: null, receivedBy: 'desk', reportedFailure: 'Falha', receivedAccessories: null, physicalCondition: null,
  priority: 'MEDIUM', status: 'TRIAGE', dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null, daysUntilDue: null }, stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T10:00:00Z', leftAt: null, durationSeconds: 0 }], dueDateHistory: [], warrantyHistory: [],
  assigneeId: null, assigneeName: null, repairSummary: null, replacedPartsSummary: null, testSummary: null, shippedAt: null, carrier: null, trackingCode: null, diagnosis: null, statusHistory: [], assignmentHistory: [],
  currentBlock: null, blockHistory: [], createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z',
};
