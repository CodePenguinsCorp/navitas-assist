import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import {
  ClientSummaryResponse,
  ProductSummaryResponse,
  RmaResponse,
  UserRole,
  UserSummaryResponse,
  WarrantyStatus
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { DashboardComponent } from './dashboard.component';

function rmaFactory(overrides: Partial<RmaResponse> = {}): RmaResponse {
  return {
    id: 1, code: 'RMA-OPEN', clientId: 1, clientName: 'Cliente',
    items: [{ id: 1, productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null,
      serialNumber: 'SER-2', manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: null, warrantyStatus: WarrantyStatus.PENDING }],
    productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null, serialNumber: 'SER-2',
    manufacturedAt: null, purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-10-20',
    invoiceNumber: null, receivedBy: 'tester', reportedFailure: 'Falha', receivedAccessories: null,
    physicalCondition: null, priority: 'MEDIUM', status: 'RECEIVED', assigneeId: null, assigneeName: null,
    repairSummary: null, replacedPartsSummary: null, testSummary: null, shippedAt: null, carrier: null,
    trackingCode: null, diagnosis: null, assignmentHistory: [],
    statusHistory: [{ status: 'RECEIVED', changedBy: 'tester', changedAt: '2026-10-20T16:00:00Z', note: null }],
    currentBlock: null, blockHistory: [],
    sla: { status: 'NORMAL', startedAt: '2026-10-20T16:00:00Z', warningAt: '2026-10-21T11:12:00Z',
      dueAt: '2026-10-21T16:00:00Z', elapsedSeconds: 0, limitSeconds: 86400 },
    createdAt: '2026-10-20T16:00:00Z', updatedAt: '2026-10-20T16:00:00Z',
    ...overrides
  };
}

const RMA_OPEN = rmaFactory();
const CLIENTS: ClientSummaryResponse = { total: 0, withContact: 0, withDocument: 0, withEmail: 0 };
const PRODUCTS: ProductSummaryResponse = { total: 0, withFirmware: 0, averageWarrantyMonths: 0, categories: [] };
const USERS: UserSummaryResponse = { total: 0, active: 0, admins: 0, roles: 0 };

type Source = 'listBoard' | 'getClientSummary' | 'getProductSummary' | 'getUserSummary';

describe('DashboardComponent load states', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let rmaService: { listBoard: ReturnType<typeof vi.fn> };
  let catalogService: { [K in Exclude<Source, 'listBoard'>]: ReturnType<typeof vi.fn> };
  const root = (): HTMLElement => fixture.nativeElement.querySelector('.page-surface');
  const text = () => root().textContent!.replace(/\s+/g, ' ').trim();
  const button = (label: string) => Array.from(root().querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  const failure = () => throwError(() => new HttpErrorResponse({ status: 500 }));

  async function setup(sources: {
    role?: UserRole;
    board?: Observable<RmaResponse[]>;
    clients?: Observable<ClientSummaryResponse>;
    products?: Observable<ProductSummaryResponse>;
    users?: Observable<UserSummaryResponse>;
    listBoard?: ReturnType<typeof vi.fn>;
  } = {}) {
    rmaService = { listBoard: sources.listBoard ?? vi.fn(() => sources.board ?? of([RMA_OPEN])) };
    catalogService = {
      getClientSummary: vi.fn(() => sources.clients ?? of(CLIENTS)),
      getProductSummary: vi.fn(() => sources.products ?? of(PRODUCTS)),
      getUserSummary: vi.fn(() => sources.users ?? of(USERS))
    };
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(sources.role ?? 'TECHNICIAN') } },
        { provide: RmaService, useValue: rmaService },
        { provide: CatalogService, useValue: catalogService }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  // Vermelho: `metrics` mostra `0%` durante a carga.
  it('shows no indicators or empty sections before the first response', async () => {
    await setup({ board: new Subject<RmaResponse[]>() });
    expect(text()).toContain('Carregando dashboard...');
    expect(text()).not.toContain('0%');
    // Preservação: o vazio da fila já não aparece durante a carga.
    expect(text()).not.toContain('Nenhum RMA na fila.');
  });

  // Vermelho: não há botão de nova tentativa, e os vazios aparecem depois da falha.
  it.each(['listBoard', 'getClientSummary', 'getProductSummary', 'getUserSummary'] as Source[])('replaces the dashboard with a retryable failure when %s fails', async (source) => {
    await setup({
      role: 'ADMIN',
      board: source === 'listBoard' ? failure() : undefined,
      clients: source === 'getClientSummary' ? failure() : undefined,
      products: source === 'getProductSummary' ? failure() : undefined,
      users: source === 'getUserSummary' ? failure() : undefined
    });
    // Preservação: a mensagem de erro já existe.
    expect(text()).toContain('Não foi possível carregar o dashboard.');
    expect(button('Tentar novamente')).toBeDefined();
    expect(text()).not.toContain('Nenhum RMA na fila.');
    expect(text()).not.toContain('Sem alterações recentes.');
    expect(text()).not.toContain('0%');
  });

  // Vermelho: não há nova tentativa.
  it('retries the complete snapshot', async () => {
    const board = new Subject<RmaResponse[]>();
    await setup({ listBoard: vi.fn().mockReturnValueOnce(failure()).mockReturnValueOnce(board) });

    const retry = button('Tentar novamente')!;
    retry.click();
    fixture.detectChanges();
    expect(retry.disabled).toBe(true);
    expect(retry.textContent?.trim()).toBe('Carregando...');
    expect(text()).toContain('Não foi possível carregar o dashboard.');

    board.next([RMA_OPEN]);
    board.complete();
    fixture.detectChanges();
    expect(root().querySelector('.alert-banner--error')).toBeNull();
    expect(text()).toContain('RMA-OPEN');
    expect(rmaService.listBoard).toHaveBeenCalledTimes(2);
    expect(catalogService.getClientSummary).toHaveBeenCalledTimes(2);
  });

  it.each(['TECHNICIAN', 'SERVICE_DESK', 'VIEWER'] as UserRole[])('preserves a single unfiltered board request without user summary for %s', async (role) => {
    await setup({ role });
    expect(rmaService.listBoard).toHaveBeenCalledTimes(1);
    expect(rmaService.listBoard).toHaveBeenCalledWith();
    expect(catalogService.getUserSummary).not.toHaveBeenCalled();
  });
});
