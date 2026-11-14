import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Signal, signal } from '@angular/core';
import { FormArray, FormGroup } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ClientResponse, ProductResponse, RmaResponse, UserSession, WarrantyStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { RmaService } from '../../core/services/rma.service';
import { RmasComponent } from './rmas.component';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { settleRmaLazyChunks } from '../../testing/lazy-chunks';

// Waits for the lazy chunks the detail view starts, so none is pending at environment teardown.
afterEach(settleRmaLazyChunks);

describe('RmasComponent form', () => {
  let component: RmaFormHarness;
  let fixture: ComponentFixture<RmasComponent>;
  let rmaService: { list: ReturnType<typeof vi.fn>; getSummary: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    rmaService = {
      list: vi.fn(() => of({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })),
      getSummary: vi.fn(() => of({ total: 45, ongoing: 30, highPriority: 7 })),
      create: vi.fn(() => of(createdRma)),
    };
    const currentUser = signal<UserSession | null>({
      username: 'tester',
      name: 'Tester',
      profileName: 'Administrador',
      permissions: [],
    });
    await TestBed.configureTestingModule({
      imports: [RmasComponent],
      providers: [
        provideRouter([]),
        providePermissions(profilePermissions('ADMIN')),
        {
          provide: AuthService,
          useValue: { currentUser: currentUser.asReadonly() },
        },
        {
          provide: CatalogService,
          useValue: { listClientOptions: () => of([]), listProductOptions: () => of([]) },
        },
        { provide: RmaService, useValue: rmaService },
        { provide: ProtocolService, useValue: { listExecutions: () => of([]), listTemplates: () => of([]) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RmasComponent);
    component = fixture.componentInstance as unknown as RmaFormHarness;
  });

  it('requires a product and at least one batch or serial number per item', () => {
    const item = component.createItems.at(0);
    expect(item.invalid).toBe(true);
    expect(item.hasError('identificationRequired')).toBe(true);

    item.patchValue({ productId: 2, serialNumber: 'SER-2' });
    expect(item.valid).toBe(true);

    component.addCreateItem();
    expect(component.createItems.length).toBe(2);
    expect(component.createForm.invalid).toBe(true);
  });

  it('reports future manufacturing and inconsistent purchase and entry dates', () => {
    const item = component.createItems.at(0);
    item.patchValue({ productId: 2, serialNumber: 'SER-2', manufacturedAt: '9999-01-01' });
    component.createForm.patchValue({ purchaseDate: '2026-06-01', entryDate: '2026-05-01' });

    expect(component.dateErrors().manufacturedAt[0]).toContain('posterior a hoje');
    expect(component.dateErrors().purchaseDate).toContain('anterior');
    expect(component.dateErrors().entryDate).toContain('anterior');
  });

  it('shows result indicators from server totals', () => {
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const summary = page.querySelector('.page-summary')?.textContent ?? '';

    expect(rmaService.getSummary).toHaveBeenCalled();
    expect(page.querySelector('.stat-card')).toBeNull();
    expect(page.textContent).not.toContain('nesta página');
    expect(summary).toContain('30');
    expect(summary).toContain('7');
  });

  it('clears a purchase date when it is marked as unknown', () => {
    component.createForm.patchValue({ purchaseDate: '2026-01-10', purchaseDateUnknown: true });
    expect(component.createForm.get('purchaseDate')?.value).toBe('');
  });

  it('closes the purchase calendar and clears its date when purchase is marked unknown', () => {
    component.openCreateModal();
    component.createForm.controls['purchaseDate'].setValue('2026-10-15');
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const picker = page.querySelector<HTMLElement>('app-date-picker[formControlName="purchaseDate"]')!;
    const trigger = picker.querySelector<HTMLButtonElement>('.date-picker__trigger')!;
    trigger.click();
    fixture.detectChanges();
    expect(picker.querySelector('.date-picker__panel')).not.toBeNull();

    page.querySelector<HTMLInputElement>('input[formControlName="purchaseDateUnknown"]')!.click();
    fixture.detectChanges();
    expect(component.createForm.controls['purchaseDate'].value).toBe('');
    expect(picker.querySelector('.date-picker__panel')).toBeNull();
    expect(trigger.disabled).toBe(true);
    expect(rmaService.create).not.toHaveBeenCalled();
  });

  it('shows the invoice number without file or receiver inputs', () => {
    component.openCreateModal();
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;

    expect(page.querySelector('input[formControlName="invoiceNumber"]')).not.toBeNull();
    expect(page.querySelector('[formControlName="invoiceFileName"]')).toBeNull();
    expect(page.querySelector('[formControlName="receivedBy"]')).toBeNull();
    expect(page.textContent).not.toContain('Arquivo da NF');
    expect(page.textContent).not.toContain('Recebida por');
  });

  it('creates an OS with its invoice number without sending a file or receiver', () => {
    component.createForm.patchValue({
      clientId: 1, purchaseDateUnknown: true, invoiceNumber: '  NF-123  ', reportedFailure: 'Falha',
    });
    component.createItems.at(0).patchValue({ productId: 2, serialNumber: 'SER-2' });
    component.createRma();

    expect(rmaService.create).toHaveBeenCalledOnce();
    const payload = rmaService.create.mock.calls[0][0];
    expect(payload.invoiceNumber).toBe('NF-123');
    expect(payload).not.toHaveProperty('invoiceFileName');
    expect(payload).not.toHaveProperty('receivedBy');
    expect(component.createForm.get('invoiceNumber')?.value).toBe('');
    expect(component.createItems.length).toBe(1);
  });

  it('shows the invoice number in details without the removed fields', () => {
    component.openDetailsModal(createdRma);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;

    expect(page.textContent).toContain('Nota fiscal');
    expect(page.textContent).toContain('NF-123');
    expect(page.textContent).not.toContain('Arquivo da NF');
    expect(page.textContent).not.toContain('Recebida por');
  });
});

interface RmaFormHarness {
  createForm: FormGroup;
  createItems: FormArray<FormGroup>;
  dateErrors: Signal<{ manufacturedAt: string[]; purchaseDate: string; entryDate: string }>;
  addCreateItem(): void;
  openCreateModal(): void;
  openDetailsModal(rma: RmaResponse): void;
  createRma(): void;
}

const createdRma: RmaResponse = {
  id: 1, code: 'OS-2026-000001', clientName: 'Cliente',
  items: [{ id: 1, productName: 'Produto', productSku: 'SKU-2', batchNumber: null,
    serialNumber: 'SER-2', manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: null, calculatedWarrantyStatus: WarrantyStatus.PENDING, warrantyOverride: null, warrantyStatus: WarrantyStatus.PENDING }],
  purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-10-20',
  invoiceNumber: 'NF-123', receivedBy: 'tester', reportedFailure: 'Falha', receivedAccessories: null,
  physicalCondition: null, priority: 'MEDIUM', status: 'RECEIVED', assigneeId: null, assigneeName: null,
  repairSummary: null, replacedPartsSummary: null, testSummary: null, carrier: null,
  trackingCode: null, diagnosis: null, statusHistory: [], assignmentHistory: [], currentBlock: null, blockHistory: [],
  dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null }, stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T12:00:00Z', leftAt: null, durationSeconds: 0 }], dueDateHistory: [], warrantyHistory: [],
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z',
};

describe('RmasComponent pending editor lifecycle', () => {
  let fixture: ComponentFixture<RmasComponent>;
  let http: HttpTestingController;
  let page: HTMLElement;
  const client: ClientResponse = {
    id: 1, legalName: 'Cliente', tradeName: null, documentNumber: null,
    email: null, phone: null, address: null, notes: null,
    updatedAt: createdRma.updatedAt
  };
  const product: ProductResponse = {
    id: 2, sku: 'SKU-2', name: 'Produto', category: null, hardwareVersion: null, firmwareVersion: null,
    defaultWarrantyMonths: 12, technicalNotes: null, updatedAt: createdRma.updatedAt
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RmasComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush({
      username: 'tester', fullName: 'Tester', profileName: 'Administrador', permissions: profilePermissions('ADMIN')
    });
    fixture = TestBed.createComponent(RmasComponent);
    http.expectOne('/api/clients/options').flush([client]);
    http.expectOne('/api/products/options').flush([product]);
    http.expectOne(r => r.method === 'GET' && r.url.split('?')[0] === '/api/rmas').flush({ content: [createdRma], page: 0, size: 20, totalElements: 1, totalPages: 1 });
    http.expectOne('/api/rmas/summary').flush({ total: 1, ongoing: 1, highPriority: 0 });
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function openEditor(mode: 'create' | 'diagnosis'): void {
    if (mode === 'create') page.querySelector<HTMLButtonElement>('.page-heading .button-primary')!.click();
    else {
      page.querySelector<HTMLElement>('.rma-table-row')!.click();
      fixture.detectChanges();
      [...page.querySelectorAll<HTMLButtonElement>('.tab')].find(b => b.textContent?.trim() === 'Diagnóstico')!.click();
      fixture.detectChanges();
      page.querySelector<HTMLButtonElement>('app-rma-diagnosis .diagnosis-trigger')!.click();
    }
    fixture.detectChanges();
  }

  function enterField(name: string, value: string): void {
    const field = page.querySelector<HTMLInputElement | HTMLTextAreaElement>(`.modal-overlay [formControlName="${name}"]`)!;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function fillEditor(mode: 'create' | 'diagnosis'): void {
    if (mode === 'create') {
      for (const [name, label] of [['clientId', 'Cliente'], ['productId', 'SKU-2 · Produto']]) {
        const select = page.querySelector<HTMLElement>(`.modal-overlay app-custom-select[formControlName="${name}"]`)!;
        select.querySelector<HTMLButtonElement>('.custom-select__trigger')!.click();
        fixture.detectChanges();
        [...select.querySelectorAll<HTMLButtonElement>('.custom-select__option')]
          .find((button) => button.textContent?.trim() === label)!.click();
        fixture.detectChanges();
      }
      enterField('serialNumber', 'SER-2');
      page.querySelector<HTMLInputElement>('.modal-overlay input[formControlName="purchaseDateUnknown"]')!.click();
      enterField('reportedFailure', 'Falha mantida');
    } else {
      enterField('foundFailure', 'Falha mantida');
      // Data e técnico do diagnóstico são preenchidos automaticamente; não há campo para digitar.
    }
    fixture.detectChanges();
  }

  function fieldValue(mode: 'create' | 'diagnosis'): string {
    const name = mode === 'create' ? 'reportedFailure' : 'foundFailure';
    return page.querySelector<HTMLTextAreaElement>(`.modal-overlay [formControlName="${name}"]`)!.value;
  }

  function exitControl(control: 'overlay' | 'close' | 'cancel'): HTMLElement {
    const selector = control === 'overlay' ? '.modal-overlay'
      : control === 'close' ? '.modal-close' : '.modal-overlay .form-actions--full .button-secondary';
    return page.querySelector<HTMLElement>(selector)!;
  }

  function submit(mode: 'create' | 'diagnosis'): TestRequest {
    page.querySelector('.modal-overlay form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    return http.expectOne({ method: mode === 'create' ? 'POST' : 'PUT',
      url: mode === 'create' ? '/api/rmas' : '/api/rmas/1/diagnosis' });
  }

  function editorFeedback(_mode: 'create' | 'diagnosis'): string | null | undefined {
    return page.querySelector('[role="dialog"] [role="alert"]')?.textContent;
  }

  function fail(request: TestRequest): void {
    request.flush({ message: 'OS not saved', details: [] }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
  }

  function succeed(request: TestRequest, mode: 'create' | 'diagnosis'): void {
    const saved: RmaResponse = mode === 'create'
      ? { ...createdRma, id: 2, code: 'OS-2026-000002', reportedFailure: 'Falha mantida' }
      : { ...createdRma, diagnosis: { id: 1, ...request.request.body,
        createdAt: createdRma.createdAt, updatedAt: createdRma.updatedAt } };
    request.flush(saved);
    if (mode === 'diagnosis') http.expectOne('/api/rmas/1').flush(saved);
    const reloaded = mode === 'create' ? [createdRma, saved] : [saved];
    http.expectOne(r => r.method === 'GET' && r.url.split('?')[0] === '/api/rmas').flush({ content: reloaded, page: 0, size: 20, totalElements: reloaded.length, totalPages: 1 });
    http.expectOne('/api/rmas/summary').flush({ total: reloaded.length, ongoing: reloaded.length, highPriority: 0 });
    fixture.detectChanges();
  }

  function expectSuccess(mode: 'create' | 'diagnosis'): void {
    expect(page.querySelector('.modal-overlay') === null).toBe(mode === 'create');
    if (mode === 'diagnosis') { exitControl('close').click(); fixture.detectChanges(); }
    expect(page.querySelector('tbody')?.textContent).toContain(mode === 'create' ? 'OS-2026-000002' : createdRma.code);
    openEditor(mode);
    expect(fieldValue(mode)).toBe(mode === 'create' ? '' : 'Falha mantida');
    exitControl('cancel').click();
    fixture.detectChanges();
    if (mode === 'diagnosis') { exitControl('close').click(); fixture.detectChanges(); }
    expect(page.querySelector('.modal-overlay')).toBeNull();
  }

  describe.each(['create', 'diagnosis'] as const)('%s', (mode) => {
    it.each(['overlay', 'close', 'cancel'] as const)('keeps the pending editor open through %s and closes on success', (control) => {
      openEditor(mode);
      fillEditor(mode);
      const request = submit(mode);
      const closeDisabled = (exitControl('close') as HTMLButtonElement).disabled;
      const cancelDisabled = (exitControl('cancel') as HTMLButtonElement).disabled;
      exitControl(control).click();
      fixture.detectChanges();
      const stillOpen = page.querySelector('.modal-overlay') !== null;
      const cancelled = request.cancelled;
      succeed(request, mode);

      expect(stillOpen).toBe(true);
      expect(closeDisabled).toBe(true);
      expect(cancelDisabled).toBe(true);
      expect(cancelled).toBe(false);
      expectSuccess(mode);
    });

    it('keeps values and feedback on failure and permits manual closure', () => {
      openEditor(mode);
      fillEditor(mode);
      fail(submit(mode));
      expect(editorFeedback(mode)).toContain('OS not saved');
      expect(fieldValue(mode)).toBe('Falha mantida');
      expect((exitControl('close') as HTMLButtonElement).disabled).toBe(false);
      expect((exitControl('cancel') as HTMLButtonElement).disabled).toBe(false);
      exitControl('close').click();
      fixture.detectChanges();
      expect(page.querySelector('.modal-overlay')).toBeNull();
    });

    it('can retry after failure and then closes and refreshes normally', () => {
      openEditor(mode);
      fillEditor(mode);
      fail(submit(mode));
      const retry = submit(mode);
      expect(retry.request.body[mode === 'create' ? 'reportedFailure' : 'foundFailure']).toBe('Falha mantida');
      expect(page.textContent).not.toContain('OS not saved');
      succeed(retry, mode);
      expectSuccess(mode);
    });

    it.each(['overlay', 'close', 'cancel'] as const)('preserves idle closure through %s', (control) => {
      openEditor(mode);
      exitControl(control).click();
      fixture.detectChanges();
      expect(page.querySelector('.modal-overlay') === null).toBe(mode === 'create' || control !== 'cancel');
    });

    it('does not send an invalid editor form', () => {
      openEditor(mode);
      page.querySelector('.modal-overlay form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      http.expectNone({ method: mode === 'create' ? 'POST' : 'PUT',
        url: mode === 'create' ? '/api/rmas' : '/api/rmas/1/diagnosis' });
      expect(editorFeedback(mode)).toContain('Preencha os campos obrigatórios');
      expect((exitControl('close') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('preserves read-only detail closure', () => {
    page.querySelector<HTMLElement>('.rma-table-row')!.click();
    fixture.detectChanges();
    exitControl('close').click();
    fixture.detectChanges();
    expect(page.querySelector('.modal-overlay')).toBeNull();
  });
});
