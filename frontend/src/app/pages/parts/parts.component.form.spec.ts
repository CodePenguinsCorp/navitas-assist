import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { PartResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { LoadingService } from '../../core/services/loading.service';
import { PartService } from '../../core/services/part.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { mountUnderRoot, simulateNativeModality } from '../../testing/native-dialog';
import { PartsComponent } from './parts.component';

const PART: PartResponse = {
  id: 4, code: 'PCA-1', name: 'Capacitor', unit: 'm', location: 'A1', minimumStock: 8, unitCost: 10,
  onHand: 10, reserved: 4, available: 6, belowMinimum: true, active: true,
  createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
};
const VALUES = { code: ' PCA-1 ', name: ' Capacitor ', unit: ' m ', location: '   ', minimumStock: 2.5, unitCost: 12.75, active: false };
const PAYLOAD = { code: 'PCA-1', name: 'Capacitor', unit: 'm', location: null, minimumStock: 2.5, unitCost: 12.75, active: false };
type Mode = 'create' | 'update';
interface Harness {
  form: FormGroup;
  openCreateModal(): void;
  openEditModal(part: PartResponse): void;
  closeModals(): void;
  savePart(): void;
}

describe('PartsComponent part form', () => {
  let fixture: ComponentFixture<PartsComponent>;
  let component: Harness;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  const panel = (): HTMLElement | null => fixture.nativeElement.querySelector('.modal-panel');
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const cancel = () => Array.from(panel()!.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Cancelar')!;
  const submit = () => { panel()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); render(); };

  async function setup(mode: Mode = 'create', pending?: Subject<PartResponse>, loadFailed = false) {
    service = {
      list: vi.fn(() => loadFailed ? throwError(() => new Error()) : of([PART])),
      listReplenishment: vi.fn(() => of([])), listPending: vi.fn(() => of([])),
      create: vi.fn(() => mode === 'create' && pending ? pending : of(PART)),
      update: vi.fn(() => mode === 'update' && pending ? pending : of(PART)),
      registerMovement: vi.fn()
    };
    await TestBed.configureTestingModule({ imports: [PartsComponent], providers: [
      { provide: PartService, useValue: service },
      { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes('SERVICE_DESK') } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(PartsComponent);
    component = fixture.componentInstance as unknown as Harness;
    fixture.detectChanges();
    if (mode === 'create') component.openCreateModal(); else component.openEditModal(PART);
    component.form.setValue(VALUES); render();
  }

  // Vermelho: os controles estão em uma grade plana, sem os dois grupos identificados.
  it('groups identification and stock policy', async () => {
    await setup();
    const sections = panel()!.querySelectorAll('fieldset.form-section');
    expect(Array.from(sections).map((section) => section.querySelector('legend')?.textContent?.trim())).toEqual(['Identificação', 'Estoque e custo']);
    expect(Array.from(sections[0].querySelectorAll('[formControlName]')).map((input) => input.getAttribute('formControlName'))).toEqual(['code', 'name', 'unit', 'location']);
    expect(Array.from(sections[1].querySelectorAll('[formControlName]')).map((input) => input.getAttribute('formControlName'))).toEqual(['minimumStock', 'unitCost', 'active']);
  });

  // Vermelho: Fechar e overlay descartam o cadastro mesmo com uma escrita pendente.
  it.each((['create', 'update'] as Mode[]).flatMap((mode) => ['header', 'overlay', 'method'].map((close) => ({ mode, close }))))('keeps the $mode form when closing through $close while saving', async ({ mode, close }) => {
    const request = new Subject<PartResponse>();
    await setup(mode, request);
    submit();
    const currentPanel = panel()!;
    if (close === 'header') currentPanel.querySelector<HTMLButtonElement>('[aria-label="Fechar"]')!.click();
    else if (close === 'overlay') fixture.nativeElement.querySelector('.modal-overlay').click();
    else component.closeModals();
    render();
    expect(currentPanel.isConnected).toBe(true);
    expect(currentPanel.querySelector<HTMLButtonElement>('[aria-label="Fechar"]')!.disabled).toBe(true);
    expect(currentPanel.querySelector<HTMLInputElement>('[formControlName="name"]')!.value).toBe(' Capacitor ');
    request.next(PART); request.complete(); render();
    expect(panel()).toBeNull();
    for (const method of ['list', 'listReplenishment', 'listPending']) expect(service[method]).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('sucesso');
  });

  // Vermelho: a chamada direta a savePart repete create/update antes da resposta.
  it.each(['create', 'update'] as Mode[])('sends a pending %s only once', async (mode) => {
    const request = new Subject<PartResponse>();
    await setup(mode, request);
    submit(); component.savePart(); render();
    expect(service[mode]).toHaveBeenCalledTimes(1);
    expect(panel()).not.toBeNull();
    request.error({ error: { message: 'Gravação recusada' } }); render();
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toContain('Gravação recusada');
    expect(component.form.getRawValue()).toEqual(VALUES);
    component.closeModals(); render(); expect(panel()).toBeNull();
  });

  it.each(['create', 'update'] as Mode[])('preserves disabled Cancelar and submit during %s', async (mode) => {
    const request = new Subject<PartResponse>();
    await setup(mode, request); submit();
    const currentPanel = panel()!;
    expect(cancel().disabled).toBe(true);
    expect(currentPanel.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(true);
    cancel().click(); currentPanel.querySelector<HTMLButtonElement>('[type="submit"]')!.click(); render();
    expect(currentPanel.isConnected).toBe(true);
    expect(service[mode]).toHaveBeenCalledTimes(1);
    request.error(new Error()); render();
  });

  it.each(['create', 'update'] as Mode[])('preserves values and a local error, then allows retry and closes on %s success', async (mode) => {
    const request = new Subject<PartResponse>();
    await setup(mode, request); submit();
    request.error({ error: { message: 'Código já utilizado' } }); render();
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toContain('Código já utilizado');
    expect(component.form.getRawValue()).toEqual(VALUES);
    expect(cancel().disabled).toBe(false);
    expect(panel()!.querySelector<HTMLButtonElement>('[aria-label="Fechar"]')!.disabled).toBe(false);
    service[mode].mockReturnValue(of(PART)); submit();
    expect(panel()).toBeNull();
    expect(service[mode]).toHaveBeenCalledTimes(2);
    expect(service['list']).toHaveBeenCalledTimes(2);
  });

  it.each(['create', 'update'] as Mode[])('preserves the complete trimmed %s payload without changing stock', async (mode) => {
    await setup(mode); submit();
    if (mode === 'create') expect(service[mode]).toHaveBeenCalledWith(PAYLOAD);
    else expect(service[mode]).toHaveBeenCalledWith(4, PAYLOAD);
    expect(service['registerMovement']).not.toHaveBeenCalled();
    expect(service[mode === 'create' ? 'update' : 'create']).not.toHaveBeenCalled();
  });

  it('preserves location normalization and the existing field limits', async () => {
    await setup();
    for (const [name, limit] of [['code', 60], ['name', 120], ['unit', 20], ['location', 120]] as const) {
      expect(panel()!.querySelector(`[formControlName="${name}"]`)!.getAttribute('maxlength')).toBe(String(limit));
    }
    component.form.patchValue({ location: ' A1 ' }); submit();
    expect(service['create']).toHaveBeenCalledWith({ ...PAYLOAD, location: 'A1' });
  });

  it.each([
    { field: 'code', value: '' }, { field: 'name', value: '' }, { field: 'unit', value: '' },
    { field: 'code', value: 'a'.repeat(61) }, { field: 'name', value: 'a'.repeat(121) },
    { field: 'unit', value: 'a'.repeat(21) }, { field: 'location', value: 'a'.repeat(121) },
    { field: 'minimumStock', value: -1 }, { field: 'unitCost', value: -1 }
  ])('preserves validation of $field ($value)', async ({ field, value }) => {
    await setup(); component.form.patchValue({ [field]: value }); submit();
    expect(component.form.controls[field].invalid).toBe(true);
    expect(component.form.controls[field].touched).toBe(true);
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toContain('Revise os campos destacados');
    expect(service['create']).not.toHaveBeenCalled(); expect(service['update']).not.toHaveBeenCalled();
  });

  it('preserves the absence of balance controls and the action order', async () => {
    await setup();
    expect(Object.keys(component.form.controls)).toEqual(['code', 'name', 'unit', 'location', 'minimumStock', 'unitCost', 'active']);
    expect(panel()!.textContent).toContain('O saldo é alterado somente por movimentos de estoque.');
    expectCancelBeforePrimary(panel()!);
  });

  it('preserves the page load failure when cancelling a part form', async () => {
    await setup('create', undefined, true);
    cancel().click(); render();
    const page = fixture.nativeElement.querySelector('.page-surface');
    expect(page.textContent).toContain('Não foi possível carregar as peças.');
    expect(page.textContent).toContain('Tentar novamente');
  });
});

/**
 * Focus harness shared by the three parts dialogs: real triggers, Escape and the global overlay,
 * mounted under the real root, whose blocker takes focus on showModal() as in a browser.
 */
async function setupPartsFocus(serviceOverrides: Record<string, unknown>) {
  restoreModality = simulateNativeModality();
  await TestBed.configureTestingModule({ imports: [PartsComponent], providers: [
    provideRouter([{ path: '', component: PartsComponent }]),
    { provide: PartService, useValue: {
      list: vi.fn(() => of([PART])), listReplenishment: vi.fn(() => of([])), listPending: vi.fn(() => of([])),
      ...serviceOverrides
    } },
    { provide: AuthService, useValue: { hasAnyRole: () => true } }
  ] }).compileComponents();
  const { fixture, element: page } = await mountUnderRoot(PartsComponent);
  vi.useFakeTimers();
  const pageDebug = fixture.debugElement.query(By.directive(PartsComponent));
  const component = pageDebug.componentInstance as Harness;
  const loading = TestBed.inject(LoadingService);
  const blocker = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog.global-loading-dialog')!;
  const render = () => {
    pageDebug.injector.get(ChangeDetectorRef).markForCheck();
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
  const showOverlay = () => {
    loading.start();
    vi.advanceTimersByTime(200);
    render();
    expect(blocker().open, 'the root blocker is shown').toBe(true);
    expect(dialog()?.contains(document.activeElement) ?? false, 'the blocker took focus away from the dialog').toBe(false);
  };
  const hideOverlay = () => {
    loading.finish();
    vi.advanceTimersByTime(400);
    render();
    expect(blocker().open).toBe(false);
  };
  render();
  return { component, page, render, find, activate, escape, dialog, submit, showOverlay, hideOverlay };
}

let restoreModality: () => void = () => undefined;

describe('PartsComponent part form focus', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    restoreModality();
  });

  it('names the dialog, focuses Código from Nova peça and returns to it on Escape', async () => {
    const { page, find, activate, escape, dialog } = await setupPartsFocus({});
    const trigger = activate(find('.page-heading .button-primary'));
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(dialog()?.getAttribute('aria-labelledby')).toBe('part-form-title');
    expect(find('#part-form-title').textContent?.trim()).toBe('Nova peça');
    expect(document.activeElement).toBe(page.querySelector('[formControlName="code"]'));
    expect(escape().defaultPrevented).toBe(true);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('ignores Escape while saving and returns to Editar after the global overlay hides', async () => {
    const pending = new Subject<PartResponse>();
    const { find, activate, escape, dialog, submit, render, showOverlay, hideOverlay } = await setupPartsFocus({ update: vi.fn(() => pending) });
    const trigger = activate(find('button[aria-label="Editar PCA-1 Capacitor"]'));
    submit();
    expect(escape().defaultPrevented).toBe(false);
    expect(dialog()).not.toBeNull();
    showOverlay();
    const focus = vi.spyOn(trigger, 'focus');
    pending.next(PART);
    pending.complete();
    render();
    expect(dialog()).toBeNull();
    expect(document.activeElement).not.toBe(find('button[aria-label="Editar PCA-1 Capacitor"]'));
    hideOverlay();
    expect(document.activeElement).toBe(find('button[aria-label="Editar PCA-1 Capacitor"]'));
    expect(trigger.isConnected).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('falls back to the Estoque tab when the form was opened without a trigger', async () => {
    const { component, page, render, escape, dialog } = await setupPartsFocus({});
    (document.activeElement as HTMLElement | null)?.blur();
    component.openCreateModal();
    render();
    escape();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(page.querySelector('[role="tab"]'));
  });
});
