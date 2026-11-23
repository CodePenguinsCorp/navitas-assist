import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, FormGroup } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ClientResponse, CreateRmaRequest, ProductResponse, RmaResponse, UserSession } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { LoadingService } from '../../core/services/loading.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { RmaService } from '../../core/services/rma.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { buildRma, buildRmaPage } from '../../testing/rma-fixtures';
import { RmasComponent } from './rmas.component';
import { TestProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { settleRmaLazyChunks } from '../../testing/lazy-chunks';
import { toastMessages } from '../../testing/toast';

type CreateFn = (payload: CreateRmaRequest) => Observable<RmaResponse>;

interface CreateHarness {
  createForm: FormGroup;
  createItems: FormArray<FormGroup>;
  pageError(): string;
  openCreateModal(): void;
  closeModal(): void;
  createRma(): void;
}

const client: ClientResponse = {
  id: 1, legalName: 'Cliente', tradeName: null, documentNumber: null, email: null, phone: null,
  address: null, notes: null, updatedAt: '2026-10-20T12:00:00Z'
};
const product: ProductResponse = {
  id: 2, sku: 'SKU-2', name: 'Produto', category: null, hardwareVersion: null, firmwareVersion: null,
  defaultWarrantyMonths: 12, technicalNotes: null, updatedAt: '2026-10-20T12:00:00Z'
};

async function setup(options: { role?: TestProfileCode; create?: CreateFn } = {}) {
  const role = options.role ?? 'ADMIN';
  const rmaService = {
    list: vi.fn(() => of(buildRmaPage([buildRma()], 0, 20, 1))),
    getSummary: vi.fn(() => of({ total: 1, ongoing: 1, highPriority: 0 })),
    getById: vi.fn(),
    create: vi.fn(options.create ?? ((payload: CreateRmaRequest) => of(buildRma({ id: 2, code: 'OS-2026-000002', reportedFailure: payload.reportedFailure })))),
    upsertDiagnosis: vi.fn()
  };
  const currentUser = signal<UserSession | null>({ username: 'tester', name: 'Tester', profileName: 'Perfil', permissions: [] });
  await TestBed.configureTestingModule({
    imports: [RmasComponent],
    providers: [
      provideRouter([]),
      providePermissions(profilePermissions(role)),
      {
        provide: AuthService,
        useValue: { currentUser: currentUser.asReadonly() }
      },
      { provide: CatalogService, useValue: { listClientOptions: () => of([client]), listProductOptions: () => of([product]), listAssignableUsers: () => of([]) } },
      { provide: RmaService, useValue: rmaService },
      { provide: ProtocolService, useValue: { listExecutions: () => of([]), listTemplates: () => of([]) } }
    ]
  }).compileComponents();
  const fixture: ComponentFixture<RmasComponent> = TestBed.createComponent(RmasComponent);
  fixture.detectChanges();
  const component = fixture.componentInstance as unknown as CreateHarness;
  const page = fixture.nativeElement as HTMLElement;
  const render = () => fixture.detectChanges();

  const open = () => {
    component.openCreateModal();
    render();
  };
  /** The open creation panel, found without relying on its dialog role. */
  const panel = () => page.querySelector<HTMLElement>('.modal-overlay .modal-panel');
  const dialog = () => page.querySelector<HTMLElement>('.modal-overlay [role="dialog"]');
  const alertText = () => dialog()?.querySelector('[role="alert"]')?.textContent?.trim() ?? null;
  const submit = () => {
    panel()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    render();
  };
  const fillValid = () => {
    component.createForm.patchValue({ clientId: 1, reportedFailure: 'Falha mantida', purchaseDateUnknown: true });
    component.createItems.at(0).patchValue({ productId: 2, serialNumber: 'SER-2' });
    render();
  };

  return { fixture, component, page, render, rmaService, open, panel, dialog, alertText, submit, fillValid };
}

/** Text of the elements an element points to through aria-describedby. */
function describedText(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ');
}

// Waits for the lazy chunks the detail view starts, so none is pending at environment teardown.
afterEach(settleRmaLazyChunks);

describe('RmasComponent creation messages', () => {
  it('busca cliente e produto no modal e atualiza os campos da nova OS', async () => {
    const { component, open, dialog, render } = await setup();
    open();
    for (const [field, query, id] of [['clientId', 'ENTE', 1], ['productId', 'u-2', 2]] as const) {
      dialog()!.querySelector<HTMLButtonElement>(`app-custom-select[formControlName="${field}"] button`)!.click();
      render();
      const search = dialog()!.querySelector<HTMLInputElement>('input[role="combobox"]')!;
      expect(document.activeElement).toBe(search);
      search.value = query;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      render();
      expect(dialog()!.querySelectorAll('[role="option"]')).toHaveLength(1);
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      render();
      const form = field === 'clientId' ? component.createForm : component.createItems.at(0);
      expect(form.get(field)?.value).toBe(id);
    }
    dialog()!.querySelector<HTMLButtonElement>('app-custom-select[formControlName="priority"] button')!.click();
    render();
    expect(dialog()!.querySelector('input[role="combobox"]')).toBeNull();
  });

  it('marks the creation dialog for assistive technology', async () => {
    // Hoje o article do diálogo não tem role="dialog", aria-modal nem aria-labelledby, e mostra "Preencha os dados do atendimento.".
    const { page, open, dialog } = await setup();
    open();

    const panel = dialog();
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('aria-modal')).toBe('true');
    const titleId = panel!.getAttribute('aria-labelledby')!;
    expect(page.querySelector(`#${titleId}`)?.textContent?.trim()).toBe('Nova OS');
    expect(page.textContent).not.toContain('Preencha os dados do atendimento');
  });

  it('shows required-field errors and the banner inside the dialog after an invalid submit', async () => {
    // Hoje "Preencha os campos obrigatórios." vai para .status-card fora do diálogo e não há mensagem por campo.
    const { page, open, submit, panel, alertText, rmaService } = await setup();
    open();
    submit();

    const text = panel()!.textContent ?? '';
    expect(text).toContain('Selecione o cliente.');
    expect(text).toContain('Selecione o produto.');
    expect(text).toContain('Descreva a falha relatada.');
    expect(alertText()).toBe('Preencha os campos obrigatórios.');
    expect(page.querySelector('.status-card')).toBeNull();
    expect(rmaService.create).not.toHaveBeenCalled();
  });

  it('shows length errors for batch and serial', async () => {
    // Hoje lote e série com 61 caracteres não mostram mensagem.
    const { component, open, render, submit, panel } = await setup();
    open();
    component.createItems.at(0).patchValue({ productId: 2 });
    component.createItems.at(0).controls['batchNumber'].setValue('L'.repeat(61));
    component.createItems.at(0).controls['serialNumber'].setValue('S'.repeat(61));
    render();
    submit();

    const errors = [...panel()!.querySelectorAll('.field-error')].map((node) => node.textContent?.trim());
    expect(errors.filter((message) => message === 'Use até 60 caracteres.').length).toBe(2);
  });

  it('shows date errors next to their fields with the banner inside the dialog', async () => {
    // Hoje "Corrija as datas indicadas no formulário." vai para .status-card fora do diálogo.
    const { component, page, open, render, submit, alertText, fillValid, rmaService, panel } = await setup();
    open();
    fillValid();
    component.createForm.patchValue({ purchaseDateUnknown: false, purchaseDate: '2026-06-01', entryDate: '2026-05-01' });
    render();
    submit();

    expect(alertText()).toBe('Corrija as datas indicadas no formulário.');
    expect(page.querySelector('.status-card')).toBeNull();
    expect(rmaService.create).not.toHaveBeenCalled();
    const fieldError = (name: string) =>
      panel()!.querySelector(`app-date-picker[formControlName="${name}"]`)!.closest('.field-group')!
        .querySelector('.field-error')?.textContent?.trim() ?? null;
    expect(fieldError('entryDate')).toBe('A entrada não pode ser anterior à compra.');
    expect(fieldError('purchaseDate')).toBeNull();

    component.createForm.patchValue({ entryDate: '2026-06-10' });
    render();
    expect(fieldError('entryDate')).toBeNull();
  });

  it('ties each field error to its control and marks the control invalid', async () => {
    // Hoje os <small class="field-error"> não têm id e os controles não têm aria-describedby nem aria-invalid.
    const { component, open, render, submit, panel } = await setup();
    open();
    component.createItems.at(0).controls['batchNumber'].setValue('L'.repeat(61));
    render();
    submit();

    const control = (selector: string) => panel()!.querySelector<HTMLElement>(selector)!;
    const expectTied = (element: HTMLElement, message: string) => {
      expect(element.getAttribute('aria-invalid'), message).toBe('true');
      expect(describedText(element), message).toContain(message);
    };
    expectTied(control('app-custom-select[formControlName="clientId"] .custom-select__trigger'), 'Selecione o cliente.');
    expectTied(control('textarea[formControlName="reportedFailure"]'), 'Descreva a falha relatada.');
    expectTied(control('app-custom-select[formControlName="productId"] .custom-select__trigger'), 'Selecione o produto.');
    expectTied(control('input[formControlName="batchNumber"]'), 'Use até 60 caracteres.');
    expect(control('input[formControlName="serialNumber"]').getAttribute('aria-invalid')).toBeNull();

    component.createForm.patchValue({ clientId: 1, reportedFailure: 'Falha' });
    component.createItems.at(0).patchValue({ productId: 2, batchNumber: 'L1' });
    render();
    for (const selector of ['app-custom-select[formControlName="clientId"] .custom-select__trigger', 'textarea[formControlName="reportedFailure"]',
      'app-custom-select[formControlName="productId"] .custom-select__trigger', 'input[formControlName="batchNumber"]']) {
      expect(control(selector).getAttribute('aria-invalid'), selector).toBeNull();
      expect(control(selector).getAttribute('aria-describedby'), selector).toBeNull();
    }
  });

  it('ties the identification and date errors to their controls', async () => {
    // Hoje a mensagem de identificação e as de datas não estão associadas aos controles.
    const { component, open, render, submit, panel, fillValid } = await setup();
    open();
    fillValid();
    component.createItems.at(0).patchValue({ serialNumber: '', manufacturedAt: '2099-01-01' });
    component.createForm.patchValue({ purchaseDateUnknown: false, purchaseDate: '2026-06-01', entryDate: '2026-05-01' });
    render();
    submit();

    const control = (selector: string) => panel()!.querySelector<HTMLElement>(selector)!;
    for (const name of ['batchNumber', 'serialNumber']) {
      const input = control(`input[formControlName="${name}"]`);
      expect(input.getAttribute('aria-invalid'), name).toBe('true');
      expect(describedText(input), name).toContain('Informe ao menos o lote ou a série deste produto.');
    }
    const trigger = (name: string) => control(`app-date-picker[formControlName="${name}"] .date-picker__trigger`);
    expect(trigger('manufacturedAt').getAttribute('aria-invalid')).toBe('true');
    expect(describedText(trigger('manufacturedAt'))).toBe('A fabricação não pode ser posterior a hoje.');
    expect(trigger('purchaseDate').getAttribute('aria-invalid')).toBe('true');
    expect(describedText(trigger('purchaseDate'))).toBe('A compra não pode ser anterior à fabricação.');
    expect(trigger('entryDate').getAttribute('aria-invalid')).toBe('true');
    expect(describedText(trigger('entryDate'))).toBe('A entrada não pode ser anterior à compra.');

    component.createItems.at(0).patchValue({ serialNumber: 'S1', manufacturedAt: '' });
    component.createForm.patchValue({ entryDate: '2026-06-10' });
    render();
    for (const element of [control('input[formControlName="batchNumber"]'), trigger('manufacturedAt'), trigger('purchaseDate'), trigger('entryDate')]) {
      expect(element.getAttribute('aria-invalid')).toBeNull();
      expect(element.getAttribute('aria-describedby')).toBeNull();
    }
  });

  it('shows the save error inside the dialog and keeps the values', async () => {
    // Hoje a falha do serviço vai para .status-card fora do diálogo.
    const error = new HttpErrorResponse({ status: 400, error: { message: 'OS não salvo' } });
    const { component, page, open, submit, alertText, fillValid } = await setup({ create: () => throwError(() => error) });
    open();
    fillValid();
    submit();

    expect(alertText()).toBe('OS não salvo');
    expect(page.querySelector('.status-card')).toBeNull();
    expect(component.createForm.controls['reportedFailure'].value).toBe('Falha mantida');
  });

  it('clears the dialog message on reopen, on a corrected resubmit and on a new pending attempt', async () => {
    // Hoje a mensagem fica em pageError e continua na página durante o novo envio.
    let pending = new Subject<RmaResponse>();
    const error = new HttpErrorResponse({ status: 400, error: { message: 'OS não salvo' } });
    const { component, open, render, submit, alertText, fillValid } = await setup({ create: () => pending });

    open();
    submit();
    expect(alertText()).toBe('Preencha os campos obrigatórios.');
    component.closeModal();
    open();
    expect(alertText()).toBeNull();

    // Inválido, corrigido e reenviado com a requisição pendente.
    submit();
    expect(alertText()).toBe('Preencha os campos obrigatórios.');
    fillValid();
    submit();
    expect(alertText()).toBeNull();

    // Falha do serviço e nova tentativa pendente.
    pending.error(error);
    render();
    expect(alertText()).toBe('OS não salvo');
    pending = new Subject<RmaResponse>();
    submit();
    expect(alertText()).toBeNull();
  });

  it.each(['TECHNICIAN', 'VIEWER'] as const)('denies createRma to %s without calling the service', async (role) => {
    const { component, rmaService, fillValid } = await setup({ role });
    fillValid();
    component.createRma();

    expect(rmaService.create).not.toHaveBeenCalled();
    expect(component.pageError()).toBe('Seu perfil não pode abrir novas ordens de serviço.');
  });

  it.each(['ADMIN', 'SERVICE_DESK'] as const)('lets %s call createRma', async (role) => {
    const { component, rmaService, fillValid } = await setup({ role });
    fillValid();
    component.createRma();

    expect(rmaService.create).toHaveBeenCalledOnce();
    expect(toastMessages()).toEqual(['OS OS-2026-000002 criada.']);
  });

  it('keeps required and length rules for every field', async () => {
    const { component } = await setup();
    const controls = component.createForm.controls;
    const invalid = (name: string, value: unknown) => {
      controls[name].setValue(value);
      return controls[name].invalid;
    };

    expect(invalid('clientId', 0)).toBe(true);
    expect(invalid('entryDate', '')).toBe(true);
    expect(invalid('reportedFailure', '')).toBe(true);
    expect(invalid('priority', '')).toBe(true);
    for (const name of ['invoiceNumber', 'purchaseDate', 'receivedAccessories', 'physicalCondition']) {
      expect(invalid(name, '')).toBe(false);
    }
    for (const [name, length] of [['reportedFailure', 1001], ['receivedAccessories', 501], ['physicalCondition', 501]] as const) {
      controls[name].setValue('x'.repeat(length));
      expect(controls[name].hasError('maxlength')).toBe(true);
      controls[name].setValue('x'.repeat(length - 1));
      expect(controls[name].hasError('maxlength')).toBe(false);
    }
    const item = component.createItems.at(0).controls;
    for (const name of ['batchNumber', 'serialNumber']) {
      item[name].setValue('x'.repeat(61));
      expect(item[name].hasError('maxlength')).toBe(true);
      item[name].setValue('x'.repeat(60));
      expect(item[name].hasError('maxlength')).toBe(false);
    }
  });
});

describe('RmasComponent creation sections', () => {
  const sectionControls: Record<string, string[]> = {
    'Atendimento': ['clientId', 'priority', 'reportedFailure'],
    'Produtos e identificação': ['productId', 'batchNumber', 'serialNumber', 'manufacturedAt'],
    'Recebimento': ['invoiceNumber', 'purchaseDate', 'purchaseDateUnknown', 'entryDate', 'receivedAccessories', 'physicalCondition'],
  };

  function sections(form: HTMLFormElement): Map<string, HTMLElement> {
    const result = new Map<string, HTMLElement>();
    for (const heading of form.querySelectorAll<HTMLElement>(':scope > fieldset.form-section > legend, :scope > app-collapsible-section .collapsible__title')) {
      result.set(heading.textContent?.trim() ?? '', heading.closest<HTMLElement>('fieldset, app-collapsible-section')!);
    }
    return result;
  }

  function clickButton(container: HTMLElement, text: string): void {
    [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === text)!.click();
  }

  it('groups the form into Atendimento, Produtos e identificação, and Recebimento', async () => {
    // Hoje a abertura é uma grade plana, sem fieldset nem details.
    const { open, panel } = await setup();
    open();
    const form = panel()!.querySelector('form')!;
    const found = sections(form);

    expect([...found.keys()]).toEqual(Object.keys(sectionControls));
    for (const [name, controls] of Object.entries(sectionControls)) {
      for (const control of controls) {
        expect(found.get(name)!.querySelectorAll(`[formControlName="${control}"]`).length, `${control} em ${name}`).toBe(1);
        expect(form.querySelectorAll(`[formControlName="${control}"]`).length, `${control} no formulário`).toBe(1);
      }
    }
  });

  it('ties Compra desconhecida to the purchase field', async () => {
    // Hoje o checkbox "Data da compra desconhecida" é outro item da grade, fora de um grupo com o seletor.
    const { page, open, render, panel } = await setup();
    open();
    const checkbox = panel()!.querySelector<HTMLInputElement>('input[formControlName="purchaseDateUnknown"]')!;
    expect(checkbox.closest('label')?.textContent?.trim()).toBe('Compra desconhecida');
    const group = checkbox.closest<HTMLElement>('[role="group"]');

    expect(group).not.toBeNull();
    expect(group!.querySelector('app-date-picker[formControlName="purchaseDate"]')).not.toBeNull();
    expect(page.querySelector(`#${group!.getAttribute('aria-labelledby')}`)?.textContent?.trim()).toBe('Data da compra');
    expect(group!.textContent).not.toContain('Sem data da compra, a garantia fica pendente.');

    checkbox.click();
    render();
    expect(group!.querySelector<HTMLButtonElement>('.date-picker__trigger')!.disabled).toBe(true);
    expect(group!.textContent).toContain('Sem data da compra, a garantia fica pendente.');
  });

  it('removes a product row with an accessible icon button', async () => {
    // Hoje a remoção é o botão de texto "Remover" e a linha não é um grupo nomeado.
    const { open, render, panel, component } = await setup();
    open();
    const removeButtons = () => [...panel()!.querySelectorAll<HTMLButtonElement>('button[aria-label^="Remover produto"]')];
    expect(removeButtons().length).toBe(0);

    clickButton(panel()!, 'Adicionar produto');
    render();
    expect([...panel()!.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Remover')).toBe(false);
    const groups = [...panel()!.querySelectorAll('[role="group"][aria-label^="Produto "]')].map((group) => group.getAttribute('aria-label'));
    expect(groups).toEqual(['Produto 1', 'Produto 2']);

    const remove = panel()!.querySelector<HTMLButtonElement>('button[aria-label="Remover produto 2"]');
    expect(remove).not.toBeNull();
    const visible = remove!.cloneNode(true) as HTMLElement;
    visible.querySelector('.row-action__tip')?.remove();
    expect(visible.textContent?.trim()).toBe('');

    remove!.click();
    render();
    expect(component.createItems.length).toBe(1);
    expect(removeButtons().length).toBe(0);
  });

  it('has no identification help text and labels the field Série', async () => {
    const { open, panel } = await setup();
    open();
    const form = panel()!.querySelector('form')!;

    expect(form.querySelector('[placeholder="Informe lote ou serial"]')).toBeNull();
    expect(form.textContent).not.toContain('Cada produto pode ter seu próprio lote ou serial.');
    expect(form.textContent).not.toContain('Informe o lote, a série ou os dois para cada produto.');
    const labels = [...form.querySelectorAll('label')].map((label) => label.textContent?.trim());
    expect(labels).toContain('Lote');
    expect(labels).toContain('Série');
    expect(labels).not.toContain('Serial');
  });

  it('sends the full payload with a known purchase', async () => {
    const { component, open, render, submit, panel, rmaService } = await setup();
    open();
    component.createForm.patchValue({
      clientId: 1, priority: 'HIGH', invoiceNumber: '  NF-9  ', purchaseDate: '2025-02-01', entryDate: '2025-03-01',
      reportedFailure: '  Falha  ', receivedAccessories: ' Cabo ', physicalCondition: ' Riscado '
    });
    component.createItems.at(0).patchValue({ productId: 2, batchNumber: ' L1 ', manufacturedAt: '2025-01-10' });
    clickButton(panel()!, 'Adicionar produto');
    render();
    component.createItems.at(1).patchValue({ productId: 2, serialNumber: ' S2 ' });
    render();
    submit();

    expect(rmaService.create).toHaveBeenCalledOnce();
    expect(rmaService.create.mock.calls[0][0]).toEqual({
      clientId: 1,
      items: [
        { productId: 2, batchNumber: 'L1', serialNumber: null, manufacturedAt: '2025-01-10' },
        { productId: 2, batchNumber: null, serialNumber: 'S2', manufacturedAt: null }
      ],
      purchaseDate: '2025-02-01',
      purchaseDateUnknown: false,
      entryDate: '2025-03-01',
      invoiceNumber: 'NF-9',
      reportedFailure: 'Falha',
      receivedAccessories: 'Cabo',
      physicalCondition: 'Riscado',
      priority: 'HIGH',
      dueDate: null
    });
  });

  it('creates without due date sending dueDate null', async () => {
    const { open, submit, fillValid, rmaService } = await setup();
    open();
    fillValid();
    submit();
    expect(rmaService.create.mock.calls[0][0].dueDate).toBeNull();
  });

  it('sends the chosen due date', async () => {
    const { component, open, submit, fillValid, rmaService, panel } = await setup();
    open();
    fillValid();
    const field = [...panel()!.querySelectorAll('.field-group')].find((group) => group.querySelector('label')?.textContent?.trim() === 'Data limite');
    expect(field?.querySelector('app-date-picker')).not.toBeNull();
    component.createForm.patchValue({ entryDate: '2026-10-20', dueDate: '2026-11-30' });
    submit();
    expect(rmaService.create.mock.calls[0][0].dueDate).toBe('2026-11-30');
  });

  it('blocks submit and shows the error when the due date is before entry', async () => {
    const { component, open, render, submit, fillValid, rmaService, panel } = await setup();
    open();
    fillValid();
    component.createForm.patchValue({ entryDate: '2026-10-20', dueDate: '2026-10-19' });
    render();
    submit();
    expect(rmaService.create).not.toHaveBeenCalled();
    expect(panel()!.querySelector('#dueDate-error')?.textContent?.trim()).toBe('A data limite não pode ser anterior à entrada.');
  });

  it('clears the due date after a successful create', async () => {
    const { component, open, submit, fillValid } = await setup();
    open();
    fillValid();
    component.createForm.patchValue({ dueDate: '2099-12-31' });
    submit();
    expect(component.createForm.getRawValue().dueDate).toBe('');
  });

  it('sends purchaseDate null when the purchase is unknown', async () => {
    const { open, submit, fillValid, rmaService } = await setup();
    open();
    fillValid();
    submit();

    const payload = rmaService.create.mock.calls[0][0];
    expect(payload.purchaseDate).toBeNull();
    expect(payload.purchaseDateUnknown).toBe(true);
  });

  it('shows Cancelar before the primary action', async () => {
    const { open, panel } = await setup();
    open();
    expectCancelBeforePrimary(panel()!);
  });
});

describe('RmasComponent creation dialog focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function focusSetup(create?: CreateFn) {
    const context = await setup({ create });
    const loading = TestBed.inject(LoadingService);
    const render = () => {
      context.fixture.detectChanges();
      TestBed.tick();
    };
    const newButton = () => context.page.querySelector<HTMLButtonElement>('.page-heading .button-primary')!;
    const openFromButton = () => {
      const trigger = newButton();
      trigger.focus();
      trigger.click();
      render();
      return trigger;
    };
    const escape = () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      (document.activeElement ?? document.body).dispatchEvent(event);
      render();
      return event;
    };
    const showOverlay = () => { loading.start(); vi.advanceTimersByTime(200); render(); };
    const hideOverlay = () => { loading.finish(); vi.advanceTimersByTime(400); render(); };
    render();
    return { ...context, render, newButton, openFromButton, escape, showOverlay, hideOverlay };
  }

  it('focuses the Cliente selector from Nova OS and returns to it on Escape', async () => {
    const { page, dialog, openFromButton, escape } = await focusSetup();
    const trigger = openFromButton();
    const clientSelect = page.querySelector('app-custom-select[formControlName="clientId"] .custom-select__trigger');
    expect(document.activeElement).toBe(clientSelect);
    expect(escape().defaultPrevented).toBe(true);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('ignores Escape while the OS is being opened', async () => {
    const pending = new Subject<RmaResponse>();
    const { dialog, openFromButton, escape, fillValid, submit } = await focusSetup(() => pending);
    openFromButton();
    fillValid();
    submit();
    expect(escape().defaultPrevented).toBe(false);
    expect(dialog()).not.toBeNull();
    pending.error(new HttpErrorResponse({ status: 400, error: { message: 'Recusado.' } }));
  });

  it('returns to Nova OS only after the global overlay hides when the creation succeeds under it', async () => {
    const pending = new Subject<RmaResponse>();
    const { dialog, render, openFromButton, fillValid, submit, showOverlay, hideOverlay } = await focusSetup(() => pending);
    const trigger = openFromButton();
    fillValid();
    submit();
    showOverlay();
    const focus = vi.spyOn(trigger, 'focus');
    pending.next(buildRma({ id: 2, code: 'OS-2026-000002' }));
    pending.complete();
    render();
    expect(dialog()).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    hideOverlay();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });
});

describe('RmasComponent creation contract limits', () => {
  it('limits the products to 20, keeps the filled ones and explains the limit', async () => {
    const { component, open, render, page, fillValid, submit, rmaService } = await setup();
    open(); fillValid();
    const harness = component as unknown as CreateHarness & { addCreateItem(): void };
    for (let i = 0; i < 25; i++) harness.addCreateItem();
    render();
    expect(component.createItems.length).toBe(20);
    expect(component.createItems.at(0).getRawValue()['serialNumber']).toBe('SER-2');
    const add = [...page.querySelectorAll<HTMLButtonElement>('.modal-panel button')].find((b) => b.textContent?.trim() === 'Adicionar produto')!;
    expect(add.disabled).toBe(true);
    expect(page.querySelector('.modal-panel')!.textContent).toContain('Limite de 20 produtos');
    for (let i = 1; i < 20; i++) component.createItems.at(i).patchValue({ productId: 2, serialNumber: `S-${i}` });
    component.createItems.push(component.createItems.at(0) as never);
    render(); submit();
    expect(rmaService.create).not.toHaveBeenCalled();
  });

  it('sends all 20 valid products', async () => {
    const { component, open, fillValid, submit, rmaService } = await setup();
    open(); fillValid();
    const harness = component as unknown as CreateHarness & { addCreateItem(): void };
    for (let i = 1; i < 20; i++) harness.addCreateItem();
    for (let i = 1; i < 20; i++) component.createItems.at(i).patchValue({ productId: 2, serialNumber: `S-${i}` });
    submit();
    expect(rmaService.create).toHaveBeenCalledTimes(1);
    expect(rmaService.create.mock.calls[0][0].items.length).toBe(20);
  });

  it('rejects an invoice number above 80 characters and accepts 80 or empty', async () => {
    const { component, open, fillValid, submit, rmaService, render, panel } = await setup();
    open(); fillValid();
    component.createForm.patchValue({ invoiceNumber: 'N'.repeat(81) }); render(); submit();
    expect(rmaService.create).not.toHaveBeenCalled();
    expect(panel()!.textContent).toContain('Use até 80 caracteres.');
    component.createForm.patchValue({ invoiceNumber: 'N'.repeat(80) }); submit();
    expect(rmaService.create).toHaveBeenCalledTimes(1);
  });
});

describe('RmasComponent creation layout', () => {
  const group = (panel: HTMLElement, legend: string) =>
    [...panel.querySelectorAll<HTMLElement>('form > fieldset.form-section')].find((f) => f.querySelector('legend')?.textContent?.trim() === legend)!;

  it('lists products without an inner box, one row per product with a rule between them', async () => {
    const { open, render, panel } = await setup();
    open();
    [...panel()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Adicionar produto')!.click();
    render();
    const section = group(panel()!, 'Produtos e identificação');
    const rows = [...section.querySelectorAll<HTMLElement>('.rma-item-editor')];

    expect(rows.length).toBe(2);
    expect(section.querySelector('.panel, .detail-card, article')).toBeNull();
    for (const row of rows) {
      expect(row.querySelectorAll('label').length).toBe(4);
      expect(row.querySelector('app-custom-select[formControlName="productId"]')).not.toBeNull();
      expect(row.querySelector('app-date-picker[formControlName="manufacturedAt"]')).not.toBeNull();
    }
    expect(section.querySelector('.rma-items-editor__add button')?.textContent?.trim()).toBe('Adicionar produto');
  });

  it('shows the identification error only after touching both fields or submitting', async () => {
    const { open, render, submit, panel, component } = await setup();
    open();
    const batch = () => panel()!.querySelector<HTMLInputElement>('#batchNumber-0')!;
    const serial = () => panel()!.querySelector<HTMLInputElement>('#serialNumber-0')!;
    const message = 'Informe ao menos o lote ou a série deste produto.';

    expect(panel()!.textContent).not.toContain(message);
    expect(batch().getAttribute('aria-invalid')).toBeNull();
    component.createItems.at(0).controls['productId'].markAsTouched();
    render();
    expect(panel()!.textContent).not.toContain(message);
    expect(batch().getAttribute('aria-invalid')).toBeNull();
    expect(serial().getAttribute('aria-invalid')).toBeNull();

    submit();
    expect(panel()!.textContent).toContain(message);
    expect(batch().getAttribute('aria-invalid')).toBe('true');
    expect(serial().getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the identification error after the user passes through Lote and Série', async () => {
    const { open, render, panel, component } = await setup();
    open();
    const item = component.createItems.at(0).controls;
    item['batchNumber'].markAsTouched();
    render();
    expect(panel()!.textContent).not.toContain('Informe ao menos o lote ou a série deste produto.');
    item['serialNumber'].markAsTouched();
    render();
    expect(panel()!.querySelector('#identification-0-error')?.textContent?.trim()).toBe('Informe ao menos o lote ou a série deste produto.');
  });

  it('lays Recebimento on a three-column grid with the unknown-purchase checkbox beside the due date', async () => {
    const { open, panel } = await setup();
    open();
    const receipt = group(panel()!, 'Recebimento');
    const cells = [...receipt.querySelectorAll<HTMLElement>(':scope > .col-2, :scope > .col-3')];
    const names = cells.map((cell) => cell.querySelector('label, span')?.textContent?.trim());

    expect(names).toEqual(['Nota fiscal', 'Data da compra', 'Entrada', 'Data limite', 'Acessórios', 'Condição física']);
    expect(cells.slice(0, 4).every((cell) => cell.classList.contains('col-2'))).toBe(true);
    expect(cells.slice(4).every((cell) => cell.classList.contains('col-3'))).toBe(true);
    const purchase = receipt.querySelector<HTMLElement>('.rma-purchase')!;
    expect(purchase.querySelector('.rma-purchase__unknown input[type="checkbox"]')).not.toBeNull();
    expect(purchase.querySelector('.rma-purchase__unknown label')?.textContent?.trim()).toBe('Compra desconhecida');
  });

  it('puts every textarea of the form in an inline-form so they share the 6rem height', async () => {
    const { open, render, panel } = await setup();
    open();
    render();
    const form = panel()!.querySelector('form')!;
    const areas = [...form.querySelectorAll('textarea')].filter((area) => area.id !== 'reportedFailure');

    expect(form.classList.contains('inline-form')).toBe(true);
    expect(areas.map((area) => area.id)).toEqual(['receivedAccessories', 'physicalCondition']);
    for (const area of areas) {
      expect(area.closest('.inline-form')).toBe(form);
      expect(area.hasAttribute('rows')).toBe(false);
    }
  });

  it('marks the required fields with the shared required class', async () => {
    const { open, panel } = await setup();
    open();
    const required = [...panel()!.querySelectorAll('.field-group--required > label')].map((label) => label.textContent?.trim());

    expect(required).toEqual(['Cliente', 'Falha relatada', 'Produto', 'Entrada']);
  });
});
