import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, FormGroup } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ClientResponse, CreateRmaRequest, ProductResponse, RmaResponse, UserRole, UserSession } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { RmaService } from '../../core/services/rma.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { buildRma, buildRmaPage } from '../../testing/rma-fixtures';
import { RmasComponent } from './rmas.component';

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
  address: null, notes: null, createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
};
const product: ProductResponse = {
  id: 2, sku: 'SKU-2', name: 'Produto', category: null, hardwareVersion: null, firmwareVersion: null,
  defaultWarrantyMonths: 12, technicalNotes: null, createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
};

async function setup(options: { role?: UserRole; create?: CreateFn } = {}) {
  const role = options.role ?? 'ADMIN';
  const rmaService = {
    list: vi.fn(() => of(buildRmaPage([buildRma()], 0, 20, 1))),
    getSummary: vi.fn(() => of({ total: 1, ongoing: 1, highPriority: 0 })),
    history: vi.fn(() => of([])),
    getById: vi.fn(),
    create: vi.fn(options.create ?? ((payload: CreateRmaRequest) => of(buildRma({ id: 2, code: 'RMA-2026-000002', reportedFailure: payload.reportedFailure })))),
    upsertDiagnosis: vi.fn()
  };
  const currentUser = signal<UserSession | null>({ username: 'tester', name: 'Tester', role });
  await TestBed.configureTestingModule({
    imports: [RmasComponent],
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { currentUser: currentUser.asReadonly(), hasAnyRole: (roles: UserRole[]) => roles.includes(role) }
      },
      { provide: CatalogService, useValue: { listClientOptions: () => of([client]), listProductOptions: () => of([product]) } },
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

describe('RmasComponent creation messages', () => {
  it('marks the creation dialog for assistive technology', async () => {
    // Hoje o article do diálogo não tem role="dialog", aria-modal nem aria-labelledby, e mostra "Preencha os dados do atendimento.".
    const { page, open, dialog } = await setup();
    open();

    const panel = dialog();
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('aria-modal')).toBe('true');
    const titleId = panel!.getAttribute('aria-labelledby')!;
    expect(page.querySelector(`#${titleId}`)?.textContent?.trim()).toBe('Novo RMA');
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

  it('shows date errors with the banner inside the dialog', async () => {
    // Hoje "Corrija as datas indicadas no formulário." vai para .status-card fora do diálogo.
    const { component, page, open, render, submit, alertText, fillValid, rmaService } = await setup();
    open();
    fillValid();
    component.createForm.patchValue({ purchaseDateUnknown: false, purchaseDate: '2026-06-01', entryDate: '2026-05-01' });
    render();
    submit();

    expect(alertText()).toBe('Corrija as datas indicadas no formulário.');
    expect(page.querySelector('.status-card')).toBeNull();
    expect(rmaService.create).not.toHaveBeenCalled();
  });

  it('shows the save error inside the dialog and keeps the values', async () => {
    // Hoje a falha do serviço vai para .status-card fora do diálogo.
    const error = new HttpErrorResponse({ status: 400, error: { message: 'RMA não salvo' } });
    const { component, page, open, submit, alertText, fillValid } = await setup({ create: () => throwError(() => error) });
    open();
    fillValid();
    submit();

    expect(alertText()).toBe('RMA não salvo');
    expect(page.querySelector('.status-card')).toBeNull();
    expect(component.createForm.controls['reportedFailure'].value).toBe('Falha mantida');
  });

  it('clears the dialog message on reopen, on a corrected resubmit and on a new pending attempt', async () => {
    // Hoje a mensagem fica em pageError e continua na página durante o novo envio.
    let pending = new Subject<RmaResponse>();
    const error = new HttpErrorResponse({ status: 400, error: { message: 'RMA não salvo' } });
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
    expect(alertText()).toBe('RMA não salvo');
    pending = new Subject<RmaResponse>();
    submit();
    expect(alertText()).toBeNull();
  });

  it.each(['TECHNICIAN', 'VIEWER'] as const)('denies createRma to %s without calling the service', async (role) => {
    const { component, rmaService, fillValid } = await setup({ role });
    fillValid();
    component.createRma();

    expect(rmaService.create).not.toHaveBeenCalled();
    expect(component.pageError()).toBe('Seu perfil não pode abrir novos RMAs.');
  });

  it.each(['ADMIN', 'SERVICE_DESK'] as const)('lets %s call createRma', async (role) => {
    const { component, rmaService, fillValid } = await setup({ role });
    fillValid();
    component.createRma();

    expect(rmaService.create).toHaveBeenCalledOnce();
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
    for (const name of ['invoiceNumber', 'purchaseDate', 'receivedAccessories', 'physicalCondition', 'repairSummary', 'replacedPartsSummary', 'testSummary']) {
      expect(invalid(name, '')).toBe(false);
    }
    for (const [name, length] of [['reportedFailure', 1001], ['receivedAccessories', 501], ['physicalCondition', 501],
      ['repairSummary', 601], ['replacedPartsSummary', 601], ['testSummary', 801]] as const) {
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
    'Atendimento já realizado': ['repairSummary', 'replacedPartsSummary', 'testSummary']
  };

  function sections(form: HTMLFormElement): Map<string, HTMLElement> {
    const result = new Map<string, HTMLElement>();
    for (const heading of form.querySelectorAll<HTMLElement>(':scope > fieldset.form-section > legend, :scope > details > summary')) {
      result.set(heading.textContent?.trim() ?? '', heading.parentElement!);
    }
    return result;
  }

  function clickButton(container: HTMLElement, text: string): void {
    [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === text)!.click();
  }

  it('groups the form into Atendimento, Produtos e identificação, Recebimento and Atendimento já realizado', async () => {
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

  it('keeps Atendimento já realizado collapsed by default', async () => {
    // Hoje não há details: os campos retroativos ficam no mesmo nível do recebimento.
    const { open, render, panel } = await setup();
    open();
    const details = panel()!.querySelector<HTMLDetailsElement>('details.rma-create-form__done');

    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    details!.open = true;
    details!.dispatchEvent(new Event('toggle'));
    render();
    expect(details!.open).toBe(true);
    for (const name of ['repairSummary', 'replacedPartsSummary', 'testSummary']) {
      expect(details!.querySelector(`textarea[formControlName="${name}"]`)).not.toBeNull();
    }
  });

  it('opens the retroactive group, shows the message and focuses an invalid field', async () => {
    // Hoje não há grupo recolhido, a mensagem de limite não aparece e o foco não vai a nenhum campo.
    const { fixture, component, open, render, submit, panel, fillValid, rmaService } = await setup();
    open();
    fillValid();
    component.createForm.controls['repairSummary'].setValue('x'.repeat(601));
    render();
    submit();
    await fixture.whenStable();
    render();

    const details = panel()!.querySelector<HTMLDetailsElement>('details.rma-create-form__done');
    expect(details?.open).toBe(true);
    expect(details!.textContent).toContain('Use até 600 caracteres.');
    expect(document.activeElement).toBe(details!.querySelector('textarea[formControlName="repairSummary"]'));
    expect(rmaService.create).not.toHaveBeenCalled();
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

  it('shows one identification hint and the Série label', async () => {
    // Hoje cada campo tem o placeholder "Informe lote ou serial" e o rótulo é "Serial".
    const { open, panel } = await setup();
    open();
    const form = panel()!.querySelector('form')!;

    expect(form.querySelector('[placeholder="Informe lote ou serial"]')).toBeNull();
    expect(form.textContent).not.toContain('Cada produto pode ter seu próprio lote ou serial.');
    expect(form.textContent?.split('Informe o lote, a série ou os dois para cada produto.').length).toBe(2);
    const labels = [...form.querySelectorAll('label')].map((label) => label.textContent?.trim());
    expect(labels).toContain('Lote');
    expect(labels).toContain('Série');
    expect(labels).not.toContain('Serial');
  });

  it('sends the full payload with a known purchase and the retroactive group closed', async () => {
    const { component, open, render, submit, panel, rmaService } = await setup();
    open();
    component.createForm.patchValue({
      clientId: 1, priority: 'HIGH', invoiceNumber: '  NF-9  ', purchaseDate: '2025-02-01', entryDate: '2025-03-01',
      reportedFailure: '  Falha  ', receivedAccessories: ' Cabo ', physicalCondition: ' Riscado ',
      repairSummary: '  Reparo feito  ', replacedPartsSummary: '  Tela  ', testSummary: '  Teste ok  '
    });
    component.createItems.at(0).patchValue({ productId: 2, batchNumber: ' L1 ', manufacturedAt: '2025-01-10' });
    clickButton(panel()!, 'Adicionar produto');
    render();
    component.createItems.at(1).patchValue({ productId: 2, serialNumber: ' S2 ' });
    render();
    const details = panel()!.querySelector<HTMLDetailsElement>('details.rma-create-form__done');
    expect(details?.open ?? false).toBe(false);
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
      repairSummary: 'Reparo feito',
      replacedPartsSummary: 'Tela',
      testSummary: 'Teste ok'
    });
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
