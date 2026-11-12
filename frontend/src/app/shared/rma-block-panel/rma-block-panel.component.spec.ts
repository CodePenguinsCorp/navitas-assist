import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectorRef, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaResponse, UserRole } from '../../core/models';
import { Permission } from '../../core/permissions';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { loadingInterceptor, SKIP_GLOBAL_LOADING } from '../../core/interceptors/loading.interceptor';
import { LoadingService } from '../../core/services/loading.service';
import { RmaService } from '../../core/services/rma.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { RmaBlockPanelComponent } from './rma-block-panel.component';

describe('RmaBlockPanelComponent', () => {
  let fixture: ComponentFixture<RmaBlockPanelComponent>;
  let http: HttpTestingController;
  const role = signal<UserRole | readonly Permission[]>('TECHNICIAN');

  beforeEach(async () => {
    role.set('TECHNICIAN');
    await TestBed.configureTestingModule({ imports: [RmaBlockPanelComponent], providers: [
      provideHttpClient(withInterceptors([loadingInterceptor])), provideHttpClientTesting(),
      providePermissions(computed(() => { const access = role(); return typeof access === 'string' ? profilePermissions(access) : access; })),
    ] }).compileComponents();
    fixture = TestBed.createComponent(RmaBlockPanelComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function load(rma = RMA) {
    fixture.componentInstance.open(rma.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Carregando');
    http.expectOne('/api/rmas/1').flush(rma);
    fixture.detectChanges();
  }

  it('uses only a decorative local indicator on initial reading and retry without global loading', () => {
    fixture.componentInstance.open(1);
    fixture.detectChanges();
    const initial = http.expectOne('/api/rmas/1');
    expect(initial.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    expect(TestBed.inject(LoadingService).pendingCount()).toBe(0);
    const busy = fixture.nativeElement.querySelector('dialog [aria-busy="true"]');
    expect(busy?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(busy?.textContent?.trim()).toBe('');
    expect(fixture.nativeElement.querySelector('[role="status"], form')).toBeNull();
    initial.flush({}, { status: 500, statusText: 'Failure' });
    fixture.detectChanges();
    const retry = fixture.nativeElement.querySelector('[data-retry]');
    retry.click(); fixture.detectChanges();
    const retried = http.expectOne('/api/rmas/1');
    expect(retried.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    expect(TestBed.inject(LoadingService).pendingCount()).toBe(0);
    expect(retry.disabled).toBe(true);
    expect(retry.isConnected).toBe(true);
    expect(retry.textContent.trim()).toBe('Tentar novamente');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar os impedimentos');
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    retried.flush(RMA); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"], [data-retry], [role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(true);
  });

  it('still counts ordinary getById reads in global loading', () => {
    TestBed.inject(RmaService).getById(1).subscribe();
    const request = http.expectOne('/api/rmas/1');
    expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(false);
    expect(TestBed.inject(LoadingService).pendingCount()).toBe(1);
    request.flush(RMA);
    expect(TestBed.inject(LoadingService).pendingCount()).toBe(0);
  });

  it('shows load failure inside the dialog and retries the selected RMA', () => {
    fixture.componentInstance.open(1);
    http.expectOne('/api/rmas/1').flush({}, { status: 500, statusText: 'Failure' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    fixture.nativeElement.querySelector('[data-retry]').click();
    http.expectOne('/api/rmas/1').flush(RMA);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('RMA-2026-000001');
  });

  it('requires a trimmed reason and preserves input when the server refuses', () => {
    load();
    const reason: HTMLTextAreaElement = fixture.nativeElement.querySelector('[formControlName="reason"]');
    reason.value = '   ';
    reason.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    http.expectNone('/api/rmas/1/blocks');
    reason.value = '  Peça pendente  ';
    reason.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    const request = http.expectOne('/api/rmas/1/blocks');
    expect(request.request.body).toEqual({ reason: 'Peça pendente', category: null });
    request.flush({ message: 'RMA is already blocked.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog [role="alert"]')).not.toBeNull();
    expect(reason.value).toBe('  Peça pendente  ');
  });

  it('shows current and resolved history to VIEWER without mutation controls', () => {
    role.set('VIEWER');
    load({ ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK, { ...BLOCK, id: 8, reason: 'Bloqueio anterior', resolvedBy: 'desk', resolvedAt: '2026-10-20T12:00:00Z', resolutionNote: 'Resolvido anteriormente' }] });
    expect(fixture.nativeElement.textContent).toContain('Peça pendente');
    expect(fixture.nativeElement.textContent).toContain('Resolvido anteriormente');
    expect(fixture.nativeElement.textContent).toContain('20/10/2026, 07:00');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('requires a resolution note, resolves the loaded episode and emits updated state', () => {
    load({ ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] });
    const updated: RmaResponse[] = [];
    fixture.componentInstance.updated.subscribe((rma) => updated.push(rma));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    http.expectNone('/api/rmas/1/blocks/9');
    const note = fixture.nativeElement.querySelector('[formControlName="resolutionNote"]');
    note.value = 'Peça recebida';
    note.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    const request = http.expectOne('/api/rmas/1/blocks/9');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ resolutionNote: 'Peça recebida' });
    request.flush({ ...RMA, blockHistory: [{ ...BLOCK, resolvedBy: 'desk', resolvedAt: '2026-10-20T12:00:00Z', resolutionNote: 'Peça recebida' }] });
    fixture.detectChanges();
    expect(updated[0].currentBlock).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Peça recebida');
  });

  it('rejects oversized fields and keeps the dialog open during a pending write', () => {
    load();
    const reason = fixture.nativeElement.querySelector('[formControlName="reason"]');
    const category = fixture.nativeElement.querySelector('[formControlName="category"]');
    reason.value = 'x'.repeat(1001);
    reason.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    http.expectNone('/api/rmas/1/blocks');
    reason.value = 'Valid';
    reason.dispatchEvent(new Event('input'));
    category.value = 'x'.repeat(81);
    category.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    http.expectNone('/api/rmas/1/blocks');
    category.value = '';
    category.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    const request = http.expectOne('/api/rmas/1/blocks');
    fixture.detectChanges();
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(true);
    expect(reason.disabled).toBe(true);
    request.flush({ ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] });
    fixture.detectChanges();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(false);
  });

  it('cancels a previous read when another card is inspected', () => {
    fixture.componentInstance.open(1);
    const old = http.expectOne('/api/rmas/1');
    fixture.componentInstance.open(2);
    expect(old.cancelled).toBe(true);
    http.expectOne('/api/rmas/2').flush({ ...RMA, id: 2, code: 'RMA-2' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('RMA-2');
    expect(fixture.nativeElement.textContent).not.toContain('RMA-2026-000001');
  });

  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const dialog = (): HTMLDialogElement => fixture.nativeElement.querySelector('dialog');
  const form = (): HTMLFormElement => dialog().querySelector('form')!;
  const actions = () => fixture.componentInstance as unknown as { save(): void; close(): void };
  const cancelButton = () => [...dialog().querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Cancelar');
  const setField = (name: string, value: string) => {
    const input = form().querySelector<HTMLInputElement | HTMLTextAreaElement>(`[formControlName="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    render();
    return input;
  };
  const submit = () => { form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); render(); };

  it.each((['ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER'] as UserRole[]).flatMap((role) => [false, true].map((blocked) => ({ role, blocked }))))('preserves $role permissions with blocked=$blocked', ({ role: profile, blocked }) => {
    role.set(profile);
    load(blocked ? { ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] } : RMA);
    expect(dialog().open).toBe(true);
    expect(dialog().querySelector('form') !== null).toBe(profile !== 'VIEWER');
    expect(dialog().textContent).toContain('O período bloqueado continua contando no SLA.');
    if (profile === 'VIEWER') {
      actions().save();
      http.expectNone((request) => request.method === 'POST' || request.method === 'PATCH');
    }
  });

  it.each([
    { permissions: ['rma.ver', 'rma.impedimentos'] as Permission[], editable: true },
    { permissions: profilePermissions('ADMIN').filter((permission) => permission !== 'rma.impedimentos'), editable: false }
  ])('follows rma.impedimentos alone (editable=$editable)', ({ permissions, editable }) => {
    role.set(permissions);
    load();
    expect(dialog().querySelector('form') !== null).toBe(editable);
  });

  it('preserves the save guards before loading and during a write', () => {
    actions().save();
    http.expectNone((request) => request.method !== 'GET');
    load();
    setField('reason', '  Aguardando peça  ');
    setField('category', '  Peças  ');
    submit();
    const request = http.expectOne('/api/rmas/1/blocks');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Aguardando peça', category: 'Peças' });
    actions().save();
    http.expectNone('/api/rmas/1/blocks');
    actions().close();
    const escape = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(dialog().open).toBe(true);
    expect(dialog().querySelector<HTMLButtonElement>('.modal-header button')!.disabled).toBe(true);
    request.flush({ ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] });
    render();
    expect(dialog().open).toBe(true);
    expect(dialog().textContent).toContain('Peça pendente');
  });

  it.each([
    { blocked: false, message: 'RMA is already blocked.', expected: 'O RMA já foi bloqueado. Feche e abra o painel para atualizar.' },
    { blocked: true, message: 'RMA block is no longer active.', expected: 'Este impedimento já foi resolvido. Feche e abra o painel para atualizar.' }
  ])('preserves the conflict message and values with blocked=$blocked', ({ blocked, message, expected }) => {
    load(blocked ? { ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] } : RMA);
    const input = setField(blocked ? 'resolutionNote' : 'reason', '  Texto preservado  ');
    submit();
    const request = http.expectOne(blocked ? '/api/rmas/1/blocks/9' : '/api/rmas/1/blocks');
    if (blocked) expect(request.request.body).toEqual({ resolutionNote: 'Texto preservado' });
    request.flush({ message }, { status: 400, statusText: 'Bad Request' });
    render();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain(expected);
    expect(input.value).toBe('  Texto preservado  ');
    expect(input.disabled).toBe(false);
    expect(dialog().open).toBe(true);
  });

  // Vermelho: não há rodapé com Cancelar antes da ação de bloquear ou desbloquear.
  it.each([
    { blocked: false, primary: 'Bloquear RMA', legend: 'Bloquear RMA' },
    { blocked: true, primary: 'Desbloquear RMA', legend: 'Resolver impedimento' }
  ])('puts Cancelar before $primary and closes without a write', ({ blocked, primary, legend }) => {
    load(blocked ? { ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] } : RMA);
    expect([...form().querySelectorAll('button')].map((button) => button.textContent?.trim())).toEqual(['Cancelar', primary]);
    expectCancelBeforePrimary(dialog());
    expect(form().querySelector('legend')?.textContent?.trim()).toBe(legend);
    expect(form().querySelector('[type="submit"]')?.textContent?.trim()).toBe(primary);
    cancelButton()!.click();
    render();
    expect(dialog().open).toBe(false);
    http.expectNone((request) => request.method === 'POST' || request.method === 'PATCH');
  });

  // Vermelho: a validação aparece só no alerta geral, sem mensagem associada ao campo.
  it.each([
    { field: 'reason', value: '', expected: 'Informe o motivo do impedimento.' },
    { field: 'reason', value: '   ', expected: 'Informe o motivo do impedimento.' },
    { field: 'reason', value: 'x'.repeat(1001), expected: 'Use até 1000 caracteres.' },
    { field: 'category', value: 'x'.repeat(81), expected: 'Use até 80 caracteres.' },
    { field: 'resolutionNote', value: '', expected: 'Informe a nota de resolução.' },
    { field: 'resolutionNote', value: '   ', expected: 'Informe a nota de resolução.' },
    { field: 'resolutionNote', value: 'x'.repeat(1001), expected: 'Use até 1000 caracteres.' }
  ])('shows existing validation beside $field ($expected)', ({ field, value, expected }) => {
    load(field === 'resolutionNote' ? { ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] } : RMA);
    expect(form().querySelector('[role="alert"]')).toBeNull();
    if (field === 'category') setField('reason', 'Aguardando peça');
    const input = setField(field, value);
    submit();
    const group = input.closest('.field-group')!;
    expect(group.textContent).toContain(expected);
    const error = group.querySelector<HTMLElement>('[role="alert"]')!;
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(dialog().querySelector('p.field-error[role="alert"]')).toBeNull();
    http.expectNone((request) => request.method === 'POST' || request.method === 'PATCH');
    setField(field, 'Texto válido');
    expect(group.querySelector('[role="alert"]')).toBeNull();
  });

  // Vermelho: save grava um alerta genérico que duplicaria as mensagens locais.
  it.each([false, true])('does not duplicate field validation with a general alert (blocked=%s)', (blocked) => {
    load(blocked ? { ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] } : RMA);
    submit();
    expect(dialog().querySelector('p.field-error[role="alert"]')).toBeNull();
    http.expectNone((request) => request.method === 'POST' || request.method === 'PATCH');
  });

  // Vermelho: o novo botão Cancelar não existe para ficar desabilitado durante a escrita.
  it.each([false, true])('disables the new cancel action while writing (blocked=%s)', (blocked) => {
    load(blocked ? { ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] } : RMA);
    const input = setField(blocked ? 'resolutionNote' : 'reason', 'Texto mantido');
    submit();
    const request = http.expectOne(blocked ? '/api/rmas/1/blocks/9' : '/api/rmas/1/blocks');
    try {
      expect(cancelButton()?.disabled).toBe(true);
      cancelButton()!.click();
      actions().close();
      render();
      expect(dialog().open).toBe(true);
    } finally {
      request.flush({ message: 'Gravação recusada' }, { status: 400, statusText: 'Bad Request' });
      render();
    }
    expect(input.value).toBe('Texto mantido');
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('Gravação recusada');
    expect(cancelButton()?.disabled).toBe(false);
    cancelButton()!.click();
    expect(dialog().open).toBe(false);
  });
});

const BLOCK = { id: 9, reason: 'Peça pendente', category: 'Peças', blockedBy: 'tech', blockedAt: '2026-10-20T10:00:00Z', resolvedBy: null, resolvedAt: null, resolutionNote: null };
const RMA: RmaResponse = {
  id: 1, code: 'RMA-2026-000001', clientId: 1, clientName: 'Cliente', items: [], productId: 1, productName: 'Produto', productSku: 'P1', batchNumber: 'L1', serialNumber: null, manufacturedAt: null,
  purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-10-20', invoiceNumber: null, receivedBy: 'desk', reportedFailure: 'Falha', receivedAccessories: null, physicalCondition: null,
  priority: 'MEDIUM', status: 'TRIAGE', sla: { status: 'NORMAL', startedAt: '2026-10-20T10:00:00Z', warningAt: null, dueAt: null, elapsedSeconds: 0, limitSeconds: null },
  assigneeId: null, assigneeName: null, repairSummary: null, replacedPartsSummary: null, testSummary: null, shippedAt: null, carrier: null, trackingCode: null, diagnosis: null, statusHistory: [], assignmentHistory: [],
  currentBlock: null, blockHistory: [], createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z',
};

describe('RmaBlockPanelComponent native dialog focus', () => {
  let fixture: ComponentFixture<RmaBlockPanelComponent>;
  let http: HttpTestingController;
  let trigger: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RmaBlockPanelComponent], providers: [
      provideHttpClient(withInterceptors([loadingInterceptor])), provideHttpClientTesting(),
      providePermissions(profilePermissions('ADMIN')),
    ] }).compileComponents();
    fixture = TestBed.createComponent(RmaBlockPanelComponent);
    http = TestBed.inject(HttpTestingController);
    render();
    trigger = document.createElement('button');
    trigger.textContent = 'Ver impedimentos';
    document.body.appendChild(trigger);
  });

  afterEach(() => trigger.remove());

  function render(): void {
    fixture.detectChanges();
    TestBed.tick();
  }

  const page = () => fixture.nativeElement as HTMLElement;
  const dialog = () => page().querySelector<HTMLDialogElement>('dialog')!;
  const title = () => page().querySelector<HTMLElement>('#block-panel-title')!;

  function openFromTrigger(): void {
    trigger.focus();
    fixture.componentInstance.open(1);
    render();
  }

  it('focuses the title while reading and keeps it there after a failed read', () => {
    openFromTrigger();
    expect(dialog().open).toBe(true);
    expect(title().getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(title());
    http.expectOne('/api/rmas/1').flush({}, { status: 500, statusText: 'Failure' });
    render();
    expect(page().querySelector('[data-retry]')).not.toBeNull();
    expect(document.activeElement).toBe(title());
  });

  it('returns to the trigger when Fechar closes the dialog', () => {
    openFromTrigger();
    http.expectOne('/api/rmas/1').flush(RMA);
    render();
    page().querySelector<HTMLButtonElement>('.modal-header button')!.click();
    render();
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('returns to the trigger when the browser cancel closes the idle dialog', () => {
    openFromTrigger();
    http.expectOne('/api/rmas/1').flush(RMA);
    render();
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    render();
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});
