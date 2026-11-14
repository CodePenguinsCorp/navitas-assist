import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { ManualPartMovementType, PartMovementResponse, PartResponse } from '../../core/models';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { LoadingService } from '../../core/services/loading.service';
import { PartService } from '../../core/services/part.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { PartsComponent } from './parts.component';

const PART: PartResponse = {
  id: 4, code: 'PCA-1', name: 'Capacitor', unit: 'm', location: 'A1', minimumStock: 8, unitCost: 10,
  onHand: 10, reserved: 4, available: 6, belowMinimum: true, active: true,
};
const MOVEMENT: PartMovementResponse = {
  id: 9, partId: 4, partCode: 'PCA-1', partName: 'Capacitor', type: 'EXIT', quantity: 1.5,
  onHandChange: -1.5, reservedChange: 0, onHandAfter: 8.5, reservedAfter: 4, 
  rmaCode: null, reversedMovementId: null, reversed: false,
  reason: null, createdBy: 'desk', createdAt: '2026-10-24T12:00:00Z'
};
interface Harness {
  movementForm: FormGroup;
  movementTypeOptions: { value: ManualPartMovementType }[];
  openMovementModal(part: PartResponse): void;
  closeModals(): void;
  saveMovement(): void;
}

describe('PartsComponent stock movement', () => {
  let fixture: ComponentFixture<PartsComponent>;
  let component: Harness;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  const panel = (): HTMLElement | null => fixture.nativeElement.querySelector('.modal-panel');
  const text = (element: Element | null = panel()) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const submit = () => { panel()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); render(); };
  const values = (type: ManualPartMovementType, quantity: number | null, reason = '') => { component.movementForm.setValue({ type, quantity, reason }); render(); };

  async function setup(request = of(MOVEMENT)) {
    service = {
      list: vi.fn(() => of([PART])), listReplenishment: vi.fn(() => of([])), listPending: vi.fn(() => of([])),
      registerMovement: vi.fn(() => request)
    };
    await TestBed.configureTestingModule({ imports: [PartsComponent], providers: [
      { provide: PartService, useValue: service },
      providePermissions(profilePermissions('SERVICE_DESK'))
    ] }).compileComponents();
    fixture = TestBed.createComponent(PartsComponent);
    component = fixture.componentInstance as unknown as Harness;
    fixture.detectChanges(); component.openMovementModal(PART); render();
  }

  // Vermelho: o diálogo não tem seção Movimento nem os três saldos identificados.
  it('groups the movement with part context and quantity unit', async () => {
    await setup();
    expect(text(panel()!.querySelector('fieldset.form-section legend'))).toBe('Movimento');
    const facts = new Map(Array.from(panel()!.querySelectorAll('dt')).map((label) => [text(label), text(label.nextElementSibling)]));
    expect(facts.get('Código')).toBe('PCA-1'); expect(facts.get('Peça')).toBe('Capacitor');
    expect(facts.get('Em estoque')).toBe('10 m'); expect(facts.get('Reservado')).toBe('4 m'); expect(facts.get('Disponível')).toBe('6 m');
    expect(text(panel()!.querySelector('[formControlName="quantity"]')!.closest('label'))).toContain('Quantidade (m)');
  });

  // Vermelho: a saída fracionária não apresenta estoque/disponível projetados nem reserva constante.
  it('previews a fractional exit without changing reservations', async () => {
    await setup(); values('EXIT', 1);
    const input = panel()!.querySelector<HTMLInputElement>('[formControlName="quantity"]')!;
    input.value = '1.5'; input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    const preview = text(panel()!.querySelector('.movement-preview'));
    expect(preview).toContain('Em estoque: 10 m → 8,5 m');
    expect(preview).toContain('Disponível: 6 m → 4,5 m'); expect(preview).toContain('Reservado: 4 m');
    expect(preview).toContain('Estimativa sobre o saldo carregado. O saldo será confirmado ao registrar.');
    expect(service['registerMovement']).not.toHaveBeenCalled();
    expect(component.movementForm.controls['quantity'].value).toBe(1.5);
  });

  // Vermelho: entrada e ajuste assinado não atualizam uma estimativa antes/depois.
  it.each([
    { type: 'ENTRY', quantity: 2, stock: '10 m → 12 m', available: '6 m → 8 m' },
    { type: 'ADJUSTMENT', quantity: -2, stock: '10 m → 8 m', available: '6 m → 4 m' },
    { type: 'ADJUSTMENT', quantity: 2, stock: '10 m → 12 m', available: '6 m → 8 m' }
  ] as const)('updates the estimate for $type $quantity', async ({ type, quantity, stock, available }) => {
    await setup(); values(type, quantity, 'Inventário');
    const preview = text(panel()!.querySelector('.movement-preview'));
    expect(preview).toContain(`Em estoque: ${stock}`); expect(preview).toContain(`Disponível: ${available}`);
    expect(preview).toContain('Reservado: 4 m');
  });

  // Vermelho: quantidade inválida não oferece orientação em lugar dos números projetados.
  it.each([0, null, NaN, Infinity, -Infinity, -2])('does not project invalid entry quantity %s', async (quantity) => {
    await setup(); values('ENTRY', quantity);
    expect(text()).toContain('Informe uma quantidade válida para ver a estimativa.');
    expect(text()).not.toContain('→'); expect(service['registerMovement']).not.toHaveBeenCalled();
  });

  // Vermelho: validações locais aparecem só no banner, fora dos campos.
  it.each([
    { type: 'ENTRY', quantity: 0, reason: '', field: 'quantity', message: 'Informe uma quantidade diferente de zero.' },
    { type: 'ENTRY', quantity: -1, reason: '', field: 'quantity', message: 'Entradas e saídas usam quantidade positiva.' },
    { type: 'EXIT', quantity: -1, reason: '', field: 'quantity', message: 'Entradas e saídas usam quantidade positiva.' },
    { type: 'ADJUSTMENT', quantity: -1, reason: '  ', field: 'reason', message: 'Informe o motivo do ajuste.' }
  ] as const)('shows $type validation beside $field', async ({ type, quantity, reason, field, message }) => {
    await setup(); values(type, quantity, reason); submit();
    const input = panel()!.querySelector(`[formControlName="${field}"]`)!;
    expect(text(input.closest('label'))).toContain(message);
    expect(panel()!.querySelector('.modal-feedback')).toBeNull();
    expect(service['registerMovement']).not.toHaveBeenCalled();
    values('ENTRY', 1); submit(); expect(service['registerMovement']).toHaveBeenCalledTimes(1);
  });

  // Vermelho: falta explicar o disponível negativo, embora a decisão continue no servidor.
  it('explains a negative estimate and still submits to the server', async () => {
    await setup(throwError(() => ({ error: { message: 'Saldo insuficiente' } }))); values('EXIT', 7);
    expect(text()).toContain('Disponível: 6 m → -1 m');
    expect(text()).toContain('O disponível estimado ficaria negativo; o registro deve ser recusado por saldo insuficiente.');
    expect(panel()!.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false);
    submit(); expect(service['registerMovement']).toHaveBeenCalledWith(4, { type: 'EXIT', quantity: 7, reason: null });
    expect(text(panel()!.querySelector('[role="alert"]'))).toContain('Saldo insuficiente');
    expect(component.movementForm.controls['quantity'].value).toBe(7);
  });

  // Vermelho: saveMovement direto repete a escrita pendente; fechar já é preservação da Tarefa 3.
  it('keeps a pending movement and sends it once', async () => {
    const request = new Subject<PartMovementResponse>(); await setup(request); values('EXIT', 1.5, ' Motivo ');
    submit(); const currentPanel = panel()!;
    component.saveMovement(); render(); expect(service['registerMovement']).toHaveBeenCalledTimes(1);
    request.error({ error: { message: 'Movimento recusado' } }); render();
    expect(text(panel()!.querySelector('[role="alert"]'))).toContain('Movimento recusado');
    expect(component.movementForm.getRawValue()).toEqual({ type: 'EXIT', quantity: 1.5, reason: ' Motivo ' });
    expect(currentPanel.isConnected).toBe(true); component.closeModals(); render(); expect(panel()).toBeNull();
    component.openMovementModal(PART); render(); expect(text()).not.toContain('Movimento recusado');
    expect(panel()!.querySelector('[role="alert"]')).toBeNull();
  });

  it('preserves pending close guards, disabled actions and action order', async () => {
    const request = new Subject<PartMovementResponse>(); await setup(request); expectCancelBeforePrimary(panel()!); submit();
    const currentPanel = panel()!;
    const cancel = Array.from(currentPanel.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Cancelar')!;
    expect(cancel.disabled).toBe(true); expect(currentPanel.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(true);
    cancel.click(); currentPanel.querySelector<HTMLButtonElement>('[type="submit"]')!.click();
    currentPanel.querySelector<HTMLButtonElement>('[aria-label="Fechar"]')!.click();
    fixture.nativeElement.querySelector('.modal-overlay').click(); component.closeModals(); render();
    expect(currentPanel.isConnected).toBe(true); expect(service['registerMovement']).toHaveBeenCalledTimes(1);
    request.next(MOVEMENT); request.complete(); render(); expect(panel()).toBeNull();
    for (const name of ['list', 'listReplenishment', 'listPending']) expect(service[name]).toHaveBeenCalledTimes(2);
  });

  it.each([
    { type: 'ENTRY', quantity: 2, reason: '', normalized: null },
    { type: 'EXIT', quantity: 1.5, reason: '  ', normalized: null },
    { type: 'ADJUSTMENT', quantity: -2, reason: ' Inventário ', normalized: 'Inventário' },
    { type: 'ADJUSTMENT', quantity: 2, reason: 'Ajuste', normalized: 'Ajuste' },
    { type: 'ENTRY', quantity: 1, reason: 'a'.repeat(255), normalized: 'a'.repeat(255) }
  ] as const)('preserves the numeric $type payload ($quantity)', async ({ type, quantity, reason, normalized }) => {
    await setup(); values(type, quantity, reason); submit();
    expect(service['registerMovement']).toHaveBeenCalledWith(4, { type, quantity, reason: normalized }); expect(panel()).toBeNull();
  });

  it('preserves manual options and the reason length limit', async () => {
    await setup(); expect(component.movementTypeOptions.map((option) => option.value)).toEqual(['ENTRY', 'EXIT', 'ADJUSTMENT']);
    expect(panel()!.querySelector('[formControlName="reason"]')!.getAttribute('maxlength')).toBe('255');
    values('ENTRY', 1, 'a'.repeat(256)); submit(); expect(service['registerMovement']).not.toHaveBeenCalled();
  });
});

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

describe('PartsComponent stock movement focus', () => {
  afterEach(() => vi.useRealTimers());

  it('names the dialog, focuses Tipo from Movimentar and returns to it on Escape', async () => {
    const { page, find, activate, escape, dialog } = await setupPartsFocus({});
    const trigger = activate(find('button[aria-label="Movimentar PCA-1 Capacitor"]'));
    expect(dialog()?.getAttribute('aria-labelledby')).toBe('part-movement-title');
    expect(find('#part-movement-title').textContent?.trim()).toBe('Movimentar estoque');
    expect(document.activeElement).toBe(page.querySelector('app-custom-select[formControlName="type"] .custom-select__trigger'));
    expect(escape().defaultPrevented).toBe(true);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('ignores Escape while the movement is saved and returns after the global overlay hides', async () => {
    const pending = new Subject<PartMovementResponse>();
    const { fixture, find, activate, escape, dialog, submit, render, showOverlay, hideOverlay } = await setupPartsFocus({ registerMovement: vi.fn(() => pending) });
    activate(find('button[aria-label="Movimentar PCA-1 Capacitor"]'));
    (fixture.componentInstance as unknown as Harness).movementForm.setValue({ type: 'ENTRY', quantity: 1, reason: '' });
    render();
    submit();
    expect(escape().defaultPrevented).toBe(false);
    expect(dialog()).not.toBeNull();
    showOverlay();
    pending.next(MOVEMENT);
    pending.complete();
    render();
    expect(dialog()).toBeNull();
    const trigger = find('button[aria-label="Movimentar PCA-1 Capacitor"]');
    expect(document.activeElement).not.toBe(trigger);
    hideOverlay();
    expect(document.activeElement).toBe(trigger);
  });
});
