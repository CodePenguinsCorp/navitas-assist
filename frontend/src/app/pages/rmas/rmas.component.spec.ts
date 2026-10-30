import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Signal, signal } from '@angular/core';
import { FormArray, FormGroup } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RmaResponse, UserSession, WarrantyStatus } from '../../core/models';
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

describe('RmasComponent pending submissions', () => {
  let fixture: ComponentFixture<RmasComponent>;
  let http: HttpTestingController;
  let page: HTMLElement;
  type Mode = 'create' | 'diagnosis';
  const forms = [
    { mode: 'create' as const, method: 'POST', url: '/api/rmas' },
    { mode: 'diagnosis' as const, method: 'PUT', url: '/api/rmas/1/diagnosis' }
  ];

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
    http.expectOne('/api/clients').flush([{
      id: 1, legalName: 'Cliente', tradeName: null, documentNumber: null, contactName: null,
      email: null, phone: null, address: null, notes: null,
      createdAt: createdRma.createdAt, updatedAt: createdRma.updatedAt
    }]);
    http.expectOne('/api/products').flush([{
      id: 2, sku: 'SKU-2', name: 'Produto', category: null, hardwareVersion: null,
      firmwareVersion: null, defaultWarrantyMonths: 12, technicalNotes: null,
      createdAt: createdRma.createdAt, updatedAt: createdRma.updatedAt
    }]);
    http.expectOne('/api/rmas').flush([createdRma]);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function enter(selector: string, value: string): void {
    const input = page.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function selectOption(controlName: string, text: string): void {
    const select = page.querySelector<HTMLElement>('app-custom-select[formControlName="' + controlName + '"]')!;
    select.querySelector<HTMLButtonElement>('.custom-select__trigger')!.click();
    fixture.detectChanges();
    Array.from(select.querySelectorAll<HTMLButtonElement>('.custom-select__option'))
      .find((option) => option.textContent?.includes(text))!.click();
    fixture.detectChanges();
  }

  function open(mode: Mode, valid = true): void {
    if (mode === 'create') {
      page.querySelector<HTMLButtonElement>('.page-heading .button-primary')!.click();
      fixture.detectChanges();
      if (!valid) return;
      selectOption('clientId', 'Cliente');
      selectOption('productId', 'SKU-2');
      enter('#serialNumber-0', 'SER-2');
      enter('#reportedFailure', 'Falha');
      const unknown = page.querySelector<HTMLInputElement>('[formControlName="purchaseDateUnknown"]')!;
      unknown.checked = true;
      unknown.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      page.querySelector<HTMLElement>('.rma-table-row')!.click();
      fixture.detectChanges();
      page.querySelector<HTMLButtonElement>('.modal-overlay .form-actions .button-primary')!.click();
      fixture.detectChanges();
      if (!valid) return;
      enter('[formControlName="foundFailure"]', 'Falha');
    }
    fixture.detectChanges();
  }

  function submitButton(): HTMLButtonElement {
    return page.querySelector<HTMLButtonElement>('.modal-overlay button[type="submit"]')!;
  }

  function submit(): void {
    page.querySelector('.modal-overlay form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function failureValue(mode: Mode): string {
    return page.querySelector<HTMLTextAreaElement>('[formControlName="' + (mode === 'create' ? 'reportedFailure' : 'foundFailure') + '"]')!.value;
  }

  function succeed(request: TestRequest, mode: Mode): void {
    expect(request.request.body[mode === 'create' ? 'reportedFailure' : 'foundFailure']).toBe('Falha');
    const saved: RmaResponse = mode === 'create' ? createdRma : {
      ...createdRma, diagnosis: {
        id: 1, ...request.request.body, createdAt: createdRma.createdAt, updatedAt: createdRma.updatedAt
      }
    };
    request.flush(saved);
    http.expectOne({ method: 'GET', url: '/api/rmas' }).flush([saved]);
    fixture.detectChanges();
    expect(page.querySelector('.modal-overlay')).toBeNull();
    expect(page.textContent).toContain(mode === 'create' ? 'criado com sucesso' : 'salvo com sucesso');
  }

  it.each(forms)('ignores repeated $mode submissions while the first request is pending', ({ mode, method, url }) => {
    open(mode);
    submit();
    const first = http.expectOne({ method, url });
    expect(submitButton().disabled).toBe(true);

    submit();
    const duplicates = http.match({ method, url });
    for (const duplicate of duplicates) {
      duplicate.flush({ message: 'Duplicate request' }, { status: 500, statusText: 'Server Error' });
    }
    if (duplicates.length) {
      first.flush({ message: 'Pending request cleanup' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
    }
    expect(duplicates).toHaveLength(0);
    expect(first.cancelled).toBe(false);
    expect(submitButton().disabled).toBe(true);
    succeed(first, mode);
  });

  it.each(forms)('allows a manual $mode retry after an error without losing values', ({ mode, method, url }) => {
    open(mode);
    submit();
    const first = http.expectOne({ method, url });
    const payload = first.request.body;
    first.flush({ message: 'Falha temporária' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(failureValue(mode)).toBe('Falha');
    expect(submitButton().disabled).toBe(false);
    expect(page.textContent).toContain('Falha temporária');
    submit();
    const retry = http.expectOne({ method, url });
    expect(retry.request.body).toEqual(payload);
    succeed(retry, mode);
  });

  it.each(forms)('allows a new $mode operation after a successful one', ({ mode, method, url }) => {
    open(mode);
    submit();
    succeed(http.expectOne({ method, url }), mode);

    open(mode);
    expect(submitButton().disabled).toBe(false);
    submit();
    succeed(http.expectOne({ method, url }), mode);
  });

  it.each(forms)('does not send or lock an invalid $mode form', ({ mode, method, url }) => {
    open(mode, false);
    submit();
    http.expectNone({ method, url });
    expect(submitButton().disabled).toBe(false);
    expect(page.querySelector('.modal-overlay')).not.toBeNull();
  });
});
