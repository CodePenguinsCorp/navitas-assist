import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Signal, signal } from '@angular/core';
import { FormArray, FormGroup } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ClientResponse, ProductResponse, RmaResponse, UserSession, WarrantyStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { RmasComponent } from './rmas.component';

describe('RmasComponent form', () => {
  let component: RmaFormHarness;
  let fixture: ComponentFixture<RmasComponent>;
  let rmaService: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    rmaService = { list: vi.fn(() => of([])), create: vi.fn(() => of(createdRma)) };
    const currentUser = signal<UserSession | null>({
      username: 'tester',
      name: 'Tester',
      role: 'ADMIN',
    });
    await TestBed.configureTestingModule({
      imports: [RmasComponent],
      providers: [
        {
          provide: AuthService,
          useValue: { currentUser: currentUser.asReadonly(), hasAnyRole: () => true },
        },
        {
          provide: CatalogService,
          useValue: { listClients: () => of([]), listProducts: () => of([]) },
        },
        { provide: RmaService, useValue: rmaService },
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

  it('clears a purchase date when it is marked as unknown', () => {
    component.createForm.patchValue({ purchaseDate: '2026-01-10', purchaseDateUnknown: true });
    expect(component.createForm.get('purchaseDate')?.value).toBe('');
  });

  it('shows the invoice number without file or receiver inputs', () => {
    component.openCreateModal();
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;

    expect(page.querySelector('input[formControlName="invoiceNumber"]')).not.toBeNull();
    expect(page.querySelector('[formControlName="invoiceFileName"]')).toBeNull();
    expect(page.querySelector('[formControlName="receivedBy"]')).toBeNull();
    expect(page.textContent).not.toContain('Arquivo da NF');
    expect(page.textContent).not.toContain('Recebido por');
  });

  it('creates an RMA with its invoice number without sending a file or receiver', () => {
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
    expect(page.textContent).not.toContain('Recebido por');
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
  id: 1, code: 'RMA-2026-000001', clientId: 1, clientName: 'Cliente',
  items: [{ id: 1, productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null,
    serialNumber: 'SER-2', manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: null, warrantyStatus: WarrantyStatus.PENDING }],
  productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null, serialNumber: 'SER-2',
  manufacturedAt: null, purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-10-20',
  invoiceNumber: 'NF-123', receivedBy: 'tester', reportedFailure: 'Falha', receivedAccessories: null,
  physicalCondition: null, priority: 'MEDIUM', status: 'RECEIVED', assigneeId: null, assigneeName: null,
  repairSummary: null, replacedPartsSummary: null, testSummary: null, shippedAt: null, carrier: null,
  trackingCode: null, diagnosis: null, statusHistory: [], assignmentHistory: [],
  sla: { status: 'NORMAL', startedAt: '2026-10-20T12:00:00Z', warningAt: '2026-10-21T07:12:00Z',
    dueAt: '2026-10-21T12:00:00Z', elapsedSeconds: 0, limitSeconds: 86400 },
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z',
};

describe('RmasComponent pending editor lifecycle', () => {
  let fixture: ComponentFixture<RmasComponent>;
  let http: HttpTestingController;
  let page: HTMLElement;
  const client: ClientResponse = {
    id: 1, legalName: 'Cliente', tradeName: null, documentNumber: null, contactName: null,
    email: null, phone: null, address: null, notes: null,
    createdAt: createdRma.createdAt, updatedAt: createdRma.updatedAt
  };
  const product: ProductResponse = {
    id: 2, sku: 'SKU-2', name: 'Produto', category: null, hardwareVersion: null, firmwareVersion: null,
    defaultWarrantyMonths: 12, technicalNotes: null, createdAt: createdRma.createdAt, updatedAt: createdRma.updatedAt
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RmasComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush({
      id: 1, username: 'tester', fullName: 'Tester', role: 'ADMIN', active: true,
      createdAt: createdRma.createdAt, updatedAt: createdRma.updatedAt
    });
    fixture = TestBed.createComponent(RmasComponent);
    http.expectOne('/api/clients').flush([client]);
    http.expectOne('/api/products').flush([product]);
    http.expectOne('/api/rmas').flush([createdRma]);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function openEditor(mode: 'create' | 'diagnosis'): void {
    if (mode === 'create') page.querySelector<HTMLButtonElement>('.page-heading .button-primary')!.click();
    else {
      page.querySelector<HTMLElement>('.rma-table-row')!.click();
      fixture.detectChanges();
      page.querySelector<HTMLButtonElement>('.modal-overlay .form-actions .button-primary')!.click();
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
      for (const [name, label] of [['clientId', 'Cliente'], ['productId', 'SKU-2 | Produto']]) {
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
      enterField('technicianName', 'Tecnico');
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

  function fail(request: TestRequest): void {
    request.flush({ message: 'RMA not saved', details: [] }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
  }

  function succeed(request: TestRequest, mode: 'create' | 'diagnosis'): void {
    const saved: RmaResponse = mode === 'create'
      ? { ...createdRma, id: 2, code: 'RMA-2026-000002', reportedFailure: 'Falha mantida' }
      : { ...createdRma, diagnosis: { id: 1, ...request.request.body,
        createdAt: createdRma.createdAt, updatedAt: createdRma.updatedAt } };
    request.flush(saved);
    http.expectOne({ method: 'GET', url: '/api/rmas' }).flush(mode === 'create' ? [createdRma, saved] : [saved]);
    fixture.detectChanges();
  }

  function expectSuccess(mode: 'create' | 'diagnosis'): void {
    expect(page.querySelector('.modal-overlay')).toBeNull();
    expect(page.querySelector('tbody')?.textContent).toContain(mode === 'create' ? 'RMA-2026-000002' : createdRma.code);
    openEditor(mode);
    expect(fieldValue(mode)).toBe(mode === 'create' ? '' : 'Falha mantida');
    exitControl('cancel').click();
    fixture.detectChanges();
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
      expect(page.querySelector('.status-card h3')?.textContent).toContain('RMA not saved');
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
      expect(page.textContent).not.toContain('RMA not saved');
      succeed(retry, mode);
      expectSuccess(mode);
    });

    it.each(['overlay', 'close', 'cancel'] as const)('preserves idle closure through %s', (control) => {
      openEditor(mode);
      exitControl(control).click();
      fixture.detectChanges();
      expect(page.querySelector('.modal-overlay')).toBeNull();
    });

    it('does not send an invalid editor form', () => {
      openEditor(mode);
      page.querySelector('.modal-overlay form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      http.expectNone({ method: mode === 'create' ? 'POST' : 'PUT',
        url: mode === 'create' ? '/api/rmas' : '/api/rmas/1/diagnosis' });
      expect(page.querySelector('.status-card h3')?.textContent).toContain('Preencha os campos obrigatórios');
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
