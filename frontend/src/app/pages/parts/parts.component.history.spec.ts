import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PartMovementResponse, PartResponse } from '../../core/models';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { LoadingService } from '../../core/services/loading.service';
import { PartService } from '../../core/services/part.service';
import { PartsComponent } from './parts.component';

const PART: PartResponse = {
  id: 4, code: 'PCA-1', name: 'Capacitor', unit: 'm', location: 'A1', minimumStock: 8, unitCost: 10,
  onHand: 10, reserved: 4, available: 6, belowMinimum: true, active: true,
};
const OTHER_PART: PartResponse = { ...PART, id: 5, code: 'PCB-2', name: 'Peça B', unit: 'un' };
const CONSUMPTION: PartMovementResponse = {
  id: 9, partId: 4, partCode: 'PCA-1', partName: 'Capacitor', type: 'CONSUMPTION', quantity: 1.5,
  onHandChange: -1.5, reservedChange: -1.5, onHandAfter: 10, reservedAfter: 4, 
  rmaCode: 'OS-7', reversedMovementId: null, reversed: false,
  reason: 'Peça instalada', createdBy: 'tech', createdAt: '2026-10-24T12:00:00Z'
};
const REVERSAL: PartMovementResponse = {
  ...CONSUMPTION, id: 10, type: 'REVERSAL', onHandChange: 1.5, reservedChange: 0, onHandAfter: 11.5,
  reservedAfter: 4, reversedMovementId: 9, reason: 'Peça não utilizada', createdBy: 'desk'
};
interface Harness {
  openHistory(part: PartResponse): void;
  closeModals(): void;
  startReversal(movement: PartMovementResponse): void;
  confirmReversal(movement: PartMovementResponse): void;
  cancelReversal(): void;
  reversalReason: FormControl<string>;
}

describe('PartsComponent movement history', () => {
  let fixture: ComponentFixture<PartsComponent>;
  let component: Harness;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  const panel = (): HTMLElement | null => fixture.nativeElement.querySelector('.modal-panel');
  const text = (element: Element | null = panel()) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const button = (label: string, root: Element = panel()!) => Array.from(root.querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  const confirmation = (): HTMLElement | null => panel()!.querySelector('.movement-reversal');
  const items = (): HTMLElement[] => Array.from(panel()!.querySelectorAll<HTMLElement>('ol.movement-list > li.movement-item'));
  const start = () => { component.startReversal(CONSUMPTION); render(); };
  const historyFailure = () => throwError(() => new Error());

  async function setup({ role = 'ADMIN', movements = () => of([CONSUMPTION]), reverse = of(REVERSAL) }: {
    role?: LegacyProfileCode; movements?: (id: number) => Observable<PartMovementResponse[]>; reverse?: Observable<PartMovementResponse>;
  } = {}) {
    service = {
      list: vi.fn(() => of([PART, OTHER_PART])), listReplenishment: vi.fn(() => of([])), listPending: vi.fn(() => of([])),
      listMovements: vi.fn(movements), reverseMovement: vi.fn(() => reverse), reserve: vi.fn(), updateReservation: vi.fn()
    };
    await TestBed.configureTestingModule({ imports: [PartsComponent], providers: [
      { provide: PartService, useValue: service },
      providePermissions(profilePermissions(role))
    ] }).compileComponents();
    fixture = TestBed.createComponent(PartsComponent); component = fixture.componentInstance as unknown as Harness;
    fixture.detectChanges(); component.openHistory(PART); render();
  }

  // Vermelho: não existe Cancelar para limpar apenas a operação de estorno.
  it('cancels only the reversal', async () => {
    await setup(); start();
    expect(Array.from(confirmation()!.querySelectorAll('button')).map((item) => item.textContent?.trim())).toEqual(['Cancelar', 'Confirmar estorno']);
    const cancel = button('Cancelar', confirmation()!)!;
    expect(cancel.type).toBe('button');
    component.confirmReversal(CONSUMPTION); render(); expect(text(confirmation())).toContain('Informe o motivo do estorno.');
    component.reversalReason.setValue('Rascunho'); render(); cancel.click(); render();
    expect(panel()).not.toBeNull(); expect(text()).toContain('tech'); expect(text()).toContain('Peça instalada');
    expect(text()).not.toContain('Informe o motivo do estorno.'); expect(service['reverseMovement']).not.toHaveBeenCalled();
    expect(confirmation()).toBeNull(); start(); expect(component.reversalReason.value).toBe('');
    expect(confirmation()!.querySelector('[role="alert"]')).toBeNull();
  });

  // Vermelho: a confirmação tem só placeholder e Confirmar, sem identificação ou consequência.
  it('identifies the movement and opens its reason field inside the movement item', async () => {
    await setup(); start();
    expect(text(confirmation())).toContain('Estornar movimento 9');
    for (const value of ['Aplicação', '24/10/2026', 'PCA-1', 'Capacitor', 'O movimento original será mantido.']) expect(text(confirmation())).toContain(value);
    const input = confirmation()!.querySelector<HTMLInputElement>('input')!;
    const label = confirmation()!.querySelector<HTMLLabelElement>('label')!;
    expect(text(label)).toContain('Motivo do estorno'); expect(label.control).toBe(input);
    expect(input.maxLength).toBe(255); expect(button('Confirmar estorno', confirmation()!)!.type).toBe('button');
    const item = confirmation()!.closest('li.movement-item')!;
    expect(item).toBe(items()[0]); expect(text(item)).toContain('tech');
    expect(item.querySelector('[data-reverse]')).toBeNull();
  });

  // Vermelho: confirmReversal direto repete a escrita; a guarda de fechamento já existe.
  it('keeps one pending reversal and its reason on failure', async () => {
    const request = new Subject<PartMovementResponse>(); await setup({ reverse: request }); start();
    component.reversalReason.setValue(' Peça não utilizada '); component.confirmReversal(CONSUMPTION);
    component.confirmReversal(CONSUMPTION); render(); expect(service['reverseMovement']).toHaveBeenCalledTimes(1);
    const currentPanel = panel()!;
    expect(button('Cancelar', confirmation()!)!.disabled).toBe(true);
    expect(button('Confirmar estorno', confirmation()!)!.disabled).toBe(true);
    button('Cancelar', confirmation()!)!.click(); component.cancelReversal();
    component.startReversal({ ...CONSUMPTION, id: 12 }); component.closeModals();
    fixture.nativeElement.querySelector('.modal-overlay').click(); render();
    expect(currentPanel.isConnected).toBe(true); expect(text(confirmation())).toContain('Estornar movimento 9');
    request.error({ error: { message: 'Estorno recusado' } }); render();
    expect(text(confirmation()!.querySelector('[role="alert"]'))).toContain('Estorno recusado');
    expect(component.reversalReason.value).toBe(' Peça não utilizada ');
    expect(button('Cancelar', confirmation()!)!.disabled).toBe(false);
    service['reverseMovement'].mockReturnValue(of(REVERSAL)); button('Confirmar estorno', confirmation()!)!.click(); render();
    expect(service['reverseMovement']).toHaveBeenCalledTimes(2); expect(confirmation()).toBeNull();
    expect(panel()).not.toBeNull(); expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Movimento 9 estornado.');
  });

  // Vermelho: falha inicial ou após reabertura aparece como vazio, sem retry.
  it.each(['initial', 'after empty', 'after records'] as const)('retries history without reporting an empty result on failure %s', async (state) => {
    await setup({ movements: () => state === 'initial' ? historyFailure() : of(state === 'after empty' ? [] : [CONSUMPTION]) });
    if (state !== 'initial') {
      component.closeModals(); service['listMovements'].mockReturnValue(historyFailure()); component.openHistory(PART); render();
    }
    expect(text()).toContain('Tentar novamente'); expect(text()).toContain('Não foi possível carregar o histórico.');
    expect(text()).not.toContain('Nenhum movimento registrado.'); expect(text()).not.toContain('tech');
    const request = new Subject<PartMovementResponse[]>(); service['listMovements'].mockReturnValue(request);
    button('Tentar novamente')!.click(); render();
    expect(button('Tentar novamente')!.disabled).toBe(true); expect(text()).toContain('Não foi possível carregar o histórico.');
    expect(text()).not.toContain('tech'); expect(text()).not.toContain('Nenhum movimento registrado.');
    expect(service['listMovements']).toHaveBeenLastCalledWith(4);
    request.next([CONSUMPTION]); request.complete(); render();
    expect(text()).toContain('tech'); expect(text()).not.toContain('Tentar novamente');
  });

  // Vermelho: após estornar, a leitura falha e o registro antigo continua parecendo atual.
  it('replaces stale movements with a read error after a successful reversal', async () => {
    await setup(); start(); component.reversalReason.setValue('Peça não utilizada');
    service['listMovements'].mockReturnValue(historyFailure()); component.confirmReversal(CONSUMPTION); render();
    expect(text()).toContain('Tentar novamente'); expect(text()).not.toContain('tech'); expect(text()).not.toContain('Peça instalada');
    expect(text()).not.toContain('Nenhum movimento registrado.'); expect(text()).not.toContain('Estornar movimento 9');
    service['listMovements'].mockReturnValue(of([{ ...CONSUMPTION, reversed: true }, REVERSAL]));
    button('Tentar novamente')!.click(); render(); expect(text()).toContain('Estornado'); expect(text()).toContain('do movimento 9');
  });

  // Vermelho: resposta da peça A substitui os movimentos da peça B.
  it('ignores an older part history response and clears the previous reversal context', async () => {
    const older = new Subject<PartMovementResponse[]>(); const current = new Subject<PartMovementResponse[]>();
    await setup({ movements: (id) => id === 4 ? older : current });
    older.next([{ ...CONSUMPTION, reason: 'Movimento de A' }]); render(); start();
    component.confirmReversal(CONSUMPTION); component.reversalReason.setValue('Rascunho de A');
    component.openHistory(OTHER_PART); render();
    current.next([{ ...CONSUMPTION, id: 11, partId: 5, reason: 'Movimento de B' }]); current.complete();
    older.next([{ ...CONSUMPTION, reason: 'Movimento de A' }]); older.complete(); render();
    expect(text()).toContain('Movimento de B'); expect(text()).not.toContain('Movimento de A');
    expect(text()).not.toContain('Estornar movimento 9'); expect(text()).not.toContain('Informe o motivo do estorno.');
    expect(component.reversalReason.value).toBe(''); expect(older.observed).toBe(false);
  });

  // Vermelho: a falha da peça atual não oferece retry e a resposta anterior pode reaparecer.
  it('retries the current part after a context change and ignores an old read error', async () => {
    const older = new Subject<PartMovementResponse[]>();
    await setup({ movements: (id) => id === 4 ? older : historyFailure() });
    component.openHistory(OTHER_PART); older.error(new Error()); render();
    expect(text()).toContain('Tentar novamente'); expect(text()).toContain('Peça B');
    expect(text()).not.toContain('Nenhum movimento registrado.');
    service['listMovements'].mockReturnValue(of([{ ...CONSUMPTION, partId: 5, reason: 'Movimento de B' }]));
    button('Tentar novamente')!.click(); render();
    expect(service['listMovements']).toHaveBeenLastCalledWith(5); expect(text()).toContain('Movimento de B');
    expect(text()).not.toContain('Não foi possível carregar o histórico.');
  });

  // Vermelho: o limite do controle não é conferido ao confirmar diretamente o estorno.
  it('keeps an overlong reversal reason with a local error and no write', async () => {
    await setup(); start(); component.reversalReason.setValue('a'.repeat(256)); component.confirmReversal(CONSUMPTION); render();
    expect(service['reverseMovement']).not.toHaveBeenCalled();
    expect(text(confirmation()!.querySelector('[role="alert"]'))).toContain('Use até 255 caracteres.');
    expect(component.reversalReason.value).toHaveLength(256);
  });

  // Vermelho: a tabela de 10 colunas espreme cabeçalhos, datas e motivo no modal.
  it('shows each movement as a list item with type chip, one-line time, change, balances, OS, author and reason', async () => {
    await setup();
    expect(panel()!.querySelector('table')).toBeNull();
    const [item] = items();
    const chip = item.querySelector('.movement-item__type')!;
    expect(text(chip)).toBe('Aplicação'); expect(chip.classList).toContain('mini-chip'); expect(chip.classList).toContain('tone-violet');
    const time = item.querySelector('time')!;
    expect(time.getAttribute('datetime')).toBe('2026-10-24T12:00:00Z'); expect(text(time)).toBe('24/10/2026, 09:00');
    expect(text(item.querySelector('.movement-item__change'))).toBe('-1,5 m em estoque · -1,5 m reservado');
    expect(Array.from(item.querySelectorAll('.movement-item__change strong')).map((node) => text(node))).toEqual(['-1,5 m', '-1,5 m']);
    expect(text(item.querySelector('.movement-item__balance'))).toBe('Em estoque 10 m · Reservado 4 m');
    expect(text(item.querySelector('.movement-item__meta'))).toBe('OS-7 · tech');
    expect(text(item.querySelector('.movement-item__meta .code-text'))).toBe('OS-7');
    expect(text(item.querySelector('.movement-item__reason'))).toBe('Peça instalada');
  });

  it('omits the empty OS and reason, and shows only the balance that changed', async () => {
    await setup({ movements: () => of([{ ...CONSUMPTION, type: 'ENTRY', onHandChange: 20, reservedChange: 0, onHandAfter: 20, reservedAfter: 0, rmaCode: null, reason: null }]) });
    const [item] = items();
    expect(item.querySelector('.movement-item__type')!.classList).toContain('tone-success');
    expect(text(item.querySelector('.movement-item__change'))).toBe('+20 m em estoque');
    expect(text(item.querySelector('.movement-item__meta'))).toBe('tech');
    expect(item.querySelector('.movement-item__reason')).toBeNull();
    expect(text(item.querySelector('.movement-item__balance'))).toBe('Em estoque 20 m · Reservado 0 m');
  });

  it('offers Estornar as a named icon action', async () => {
    await setup();
    const action = items()[0].querySelector<HTMLButtonElement>('button[data-reverse="9"]')!;
    expect(action.classList).toContain('row-action');
    expect(action.getAttribute('aria-label')).toBe('Estornar movimento 9 Aplicação 24/10/2026, 09:00');
    expect(action.disabled).toBe(false);
  });

  // Vermelho: fechar não cancela a leitura pendente do histórico.
  it('cancels a pending history read on close and destroy', async () => {
    const request = new Subject<PartMovementResponse[]>(); await setup({ movements: () => request });
    expectPending(fixture.nativeElement); component.closeModals(); render();
    expect(request.observed).toBe(false); expect(panel()).toBeNull();
    component.openHistory(PART); render(); expect(request.observed).toBe(true);
    fixture.destroy(); expect(request.observed).toBe(false);
  });

  it('preserves original and reversal, API order, linkage and refreshed stock', async () => {
    await setup(); start(); component.reversalReason.setValue(' Peça não utilizada ');
    service['listMovements'].mockReturnValue(of([{ ...CONSUMPTION, reversed: true }, REVERSAL]));
    component.confirmReversal(CONSUMPTION); render();
    expect(service['reverseMovement']).toHaveBeenCalledWith(9, 'Peça não utilizada');
    expect(service['listMovements']).toHaveBeenCalledTimes(2); expect(service['listMovements']).toHaveBeenLastCalledWith(4);
    for (const name of ['list', 'listReplenishment', 'listPending']) expect(service[name]).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Estornado'); expect(text()).toContain('do movimento 9');
    expect(items().map((row) => text(row))).toEqual([
      expect.stringContaining('Peça instalada'), expect.stringContaining('Peça não utilizada')
    ]);
    expect(button('Estornar')).toBeUndefined(); expect(service['reserve']).not.toHaveBeenCalled(); expect(service['updateReservation']).not.toHaveBeenCalled();
  });

  it('preserves a genuine empty history after a successful read', async () => {
    await setup({ movements: () => of([]) });
    expect(text()).toContain('Nenhum movimento registrado.'); expect(text()).not.toContain('Carregando histórico...');
    expect(text()).not.toContain('Tentar novamente');
  });

  it.each(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER'] as LegacyProfileCode[])('preserves history permissions for %s', async (role) => {
    await setup({ role }); expect(text()).toContain('tech'); expect(text()).toContain('Peça instalada');
    expect(Boolean(button('Estornar'))).toBe(['ADMIN', 'SERVICE_DESK'].includes(role));
    expect(service['reverseMovement']).not.toHaveBeenCalled();
  });

  it('preserves eligibility and the absence of edit or delete actions', async () => {
    await setup({ movements: () => of([
      { ...CONSUMPTION, id: 1, type: 'RESERVATION' }, { ...CONSUMPTION, id: 2, type: 'RESERVATION_CANCEL' },
      { ...CONSUMPTION, id: 3, reversed: true }, REVERSAL,
      { ...CONSUMPTION, id: 4, type: 'ENTRY' }, { ...CONSUMPTION, id: 5, type: 'EXIT' },
      { ...CONSUMPTION, id: 6, type: 'ADJUSTMENT' }, CONSUMPTION
    ]) });
    expect(items().map((row) => Boolean(button('Estornar', row)))).toEqual([false, false, false, false, true, true, true, true]);
    expect(button('Editar')).toBeUndefined(); expect(button('Excluir')).toBeUndefined();
  });

  it.each(['', '   '])('preserves the mandatory trimmed reversal reason (%s)', async (reason) => {
    await setup(); start(); component.reversalReason.setValue(reason); component.confirmReversal(CONSUMPTION); render();
    expect(text(panel()!.querySelector('[role="alert"]'))).toContain('Informe o motivo do estorno.');
    expect(service['reverseMovement']).not.toHaveBeenCalled(); expect(panel()).not.toBeNull();
  });
});

function expectPending(root: HTMLElement): void {
  const busy = root.querySelector('[aria-busy="true"]');
  expect(busy?.textContent?.trim()).toBe('');
  expect(busy?.children.length).toBe(0);
  expect(busy?.hasAttribute('role')).toBe(false);
  expect(root.textContent).not.toMatch(/Carregando(?! opções)|Atualizando (estoque|notificações|preferências|regras|falhas)/);
}

/** Focus harness shared by the three parts dialogs: real triggers, Escape and the global overlay. */
async function setupPartsFocus(serviceOverrides: Record<string, unknown>) {
  vi.useFakeTimers();
  await TestBed.configureTestingModule({ imports: [PartsComponent], providers: [
    { provide: PartService, useValue: {
      list: vi.fn(() => of([PART])), listReplenishment: vi.fn(() => of([])), listPending: vi.fn(() => of([])),
      ...serviceOverrides
    } },
    providePermissions(profilePermissions('ADMIN'))
  ] }).compileComponents();
  const fixture = TestBed.createComponent(PartsComponent);
  const page = fixture.nativeElement as HTMLElement;
  const loading = TestBed.inject(LoadingService);
  const render = () => {
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
    TestBed.tick();
  };
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => {
    const found = page.querySelector<T>(selector);
    expect(found, selector + ' must exist').not.toBeNull();
    return found!;
  };
  const activate = (target: HTMLElement) => {
    target.focus();
    target.click();
    render();
    return target;
  };
  const escape = () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(event);
    render();
    return event;
  };
  const dialog = () => page.querySelector<HTMLElement>('[role="dialog"]');
  const submit = () => {
    find('[role="dialog"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    render();
  };
  const showOverlay = () => { loading.start(); vi.advanceTimersByTime(200); render(); };
  const hideOverlay = () => { loading.finish(); vi.advanceTimersByTime(400); render(); };
  render();
  return { fixture, page, render, find, activate, escape, dialog, submit, showOverlay, hideOverlay };
}

describe('PartsComponent movement history focus', () => {
  afterEach(() => vi.useRealTimers());

  const historyService = (reverse: Observable<PartMovementResponse> = of(REVERSAL)) =>
    ({ listMovements: vi.fn(() => of([CONSUMPTION])), reverseMovement: vi.fn(() => reverse) });

  it('names the dialog, focuses its title from Histórico and returns to it on Escape', async () => {
    const { find, activate, escape, dialog } = await setupPartsFocus(historyService());
    const trigger = activate(find('button[aria-label="Histórico PCA-1 Capacitor"]'));
    expect(dialog()?.getAttribute('aria-labelledby')).toBe('part-history-title');
    expect(document.activeElement).toBe(find('#part-history-title'));
    expect(escape().defaultPrevented).toBe(true);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps focus in the history while a reversal is started and cancelled', async () => {
    const { page, find, activate, dialog } = await setupPartsFocus(historyService());
    activate(find('button[aria-label="Histórico PCA-1 Capacitor"]'));
    const estornar = () => [...page.querySelectorAll<HTMLButtonElement>('[role="dialog"] .movement-item button')].find((item) => item.textContent?.trim() === 'Estornar');
    activate(estornar()!);
    expect(document.activeElement).toBe(find('#reversal-reason-9'));
    const cancel = [...find('.movement-reversal').querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === 'Cancelar')!;
    activate(cancel);
    expect(dialog()).not.toBeNull();
    expect(page.querySelector('.movement-reversal')).toBeNull();
    expect(document.activeElement).toBe(estornar());
  });

  it('ignores Escape while a reversal is saved', async () => {
    const pending = new Subject<PartMovementResponse>();
    const { fixture, page, find, activate, escape, dialog, render } = await setupPartsFocus(historyService(pending));
    activate(find('button[aria-label="Histórico PCA-1 Capacitor"]'));
    const harness = fixture.componentInstance as unknown as Harness;
    harness.startReversal(CONSUMPTION);
    harness.reversalReason.setValue('Lançamento duplicado');
    render();
    harness.confirmReversal(CONSUMPTION);
    render();
    expect(escape().defaultPrevented).toBe(false);
    expect(dialog()).not.toBeNull();
    expect(page.querySelector('.movement-reversal')).not.toBeNull();
    pending.error(new Error('falha'));
  });
});
