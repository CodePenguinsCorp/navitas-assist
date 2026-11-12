import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import {
  ClientSummaryResponse,
  ProductSummaryResponse,
  RmaResponse,
  UserRole,
  UserSummaryResponse,
  WarrantyStatus
} from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { DashboardComponent } from './dashboard.component';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';

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
        provideRouter([]),
        providePermissions(profilePermissions(sources.role ?? 'TECHNICIAN')),
        { provide: RmaService, useValue: rmaService },
        { provide: CatalogService, useValue: catalogService }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  it('shows no indicators or empty sections before the first response', async () => {
    await setup({ board: new Subject<RmaResponse[]>() });
    expectPending(root());
    expect(root().querySelector('.dashboard-summary')).toBeNull();
    expect(root().querySelector('.empty-state')).toBeNull();
    expect(root().querySelector('table')).toBeNull();
    expect(text()).not.toContain('0%');
    expect(text()).not.toContain('Nenhum RMA em andamento.');
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
    expect(root().querySelector('.dashboard-summary')).toBeNull();
    expect(root().querySelector('.empty-state')).toBeNull();
    expect(root().querySelector('table')).toBeNull();
    expect(text()).not.toContain('Nenhum RMA em andamento.');
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
    expect(retry.textContent?.trim()).toBe('Tentar novamente');
    expect(root().querySelector('[aria-busy="true"]')).not.toBeNull();
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

  describe('composition', () => {
    const IN_WARRANTY_ITEM = { ...RMA_OPEN.items[0], id: 7, warrantyStatus: WarrantyStatus.IN_WARRANTY };
    const RMA_CLOSED = rmaFactory({ id: 9, code: 'RMA-CLOSED', status: 'COMPLETED', priority: 'HIGH', entryDate: '2026-01-01', items: [IN_WARRANTY_ITEM] });
    const OPEN_2 = rmaFactory({ id: 2 });
    const tables = () => root().querySelectorAll('table');
    const panelOf = (element: Element) => element.closest('.panel') as HTMLElement;
    const indicator = (label: string) => Array.from(root().querySelectorAll('ul[aria-label="Indicadores do dashboard"] > li'))
      .find((item) => item.textContent?.includes(label)) as HTMLElement | undefined;
    const normalized = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const audit = () => Array.from(root().querySelectorAll<HTMLElement>('li.timeline-entry'));
    const history = (status: RmaResponse['status'], changedAt: string, note: string | null = null, changedBy = 'tester') => ({ status, changedBy, changedAt, note });

    // Vermelho: `queue` ordena todos os registros, inclusive encerrados, e não há link.
    it('keeps closed RMAs out of the priority queue and links each code', async () => {
      await setup({ board: of([RMA_CLOSED, OPEN_2]) });
      const queue = tables()[0];
      expect(normalized(queue)).not.toContain('RMA-CLOSED');
      expect(queue.querySelector('a')?.getAttribute('href')).toBe('/rmas?rma=2');
      expect(normalized(panelOf(queue).querySelector('h3'))).toContain('Fila prioritária');
      expect(text()).not.toContain('primeiros de');
    });

    // Vermelho: não há legenda de escopo quando a fila é limitada a cinco.
    it('states how many active RMAs the queue shows', async () => {
      const active = Array.from({ length: 7 }, (_, index) => rmaFactory({ id: index + 1, code: `RMA-${index + 1}` }));
      await setup({ board: of([RMA_CLOSED, ...active]) });
      expect(text()).toContain('5 primeiros de 7 RMAs em andamento');
      expect(tables()[0].querySelectorAll('tbody tr').length).toBe(5);
    });

    // Vermelho: com apenas encerrados, a fila mostra o encerrado em vez do vazio de RMAs em andamento.
    it('shows an empty active queue when every RMA is closed', async () => {
      await setup({ board: of([RMA_CLOSED]) });
      expect(text()).toContain('Nenhum RMA em andamento.');
    });

    it('preserves the queue order by priority and oldest entry', async () => {
      await setup({ board: of([
        rmaFactory({ id: 1, code: 'RMA-MED-NEW', priority: 'MEDIUM', entryDate: '2026-10-22' }),
        rmaFactory({ id: 2, code: 'RMA-LOW', priority: 'LOW', entryDate: '2026-10-01' }),
        rmaFactory({ id: 3, code: 'RMA-HIGH', priority: 'HIGH', entryDate: '2026-10-25' }),
        rmaFactory({ id: 4, code: 'RMA-MED-OLD', priority: 'MEDIUM', entryDate: '2026-10-10' })
      ]) });
      const codes = Array.from(tables()[0].querySelectorAll('tbody tr td:first-child .code-text')).map((item) => item.textContent?.trim());
      expect(codes).toEqual(['RMA-HIGH', 'RMA-MED-OLD', 'RMA-MED-NEW', 'RMA-LOW']);
    });

    // Vermelho: rótulos, escopo e detalhe não existem, Cadastros mostra a soma e há barras.
    it('states indicator scope and keeps the warranty percentage', async () => {
      await setup({
        role: 'ADMIN',
        board: of([OPEN_2, RMA_CLOSED]),
        clients: of({ ...CLIENTS, total: 3 }),
        products: of({ ...PRODUCTS, total: 4 }),
        users: of({ ...USERS, total: 2 })
      });
      expect(normalized(indicator('RMAs em andamento'))).toContain('1 de 2 registrados');
      const warranty = normalized(indicator('Itens em garantia'));
      // Preservação: o percentual de 50% já existe hoje.
      expect(warranty).toContain('50%');
      expect(warranty).toContain('1 de 2 itens · 1 pendente');
      expect(warranty).toContain('em todos os RMAs registrados');
      expect(normalized(indicator('Cadastros'))).toContain('3 clientes · 4 produtos · 2 usuários');
      expect(normalized(indicator('Cadastros'))).not.toContain('9');
      expect(root().querySelector('.meter')).toBeNull();
    });

    // Vermelho: a lista de indicadores e o formato `X · Y com prioridade alta` não existem.
    // Preservação: o cálculo da fila inicial e a ausência de usuários para quem não é ADMIN.
    it('keeps the initial queue indicator and omits users for non-admin profiles', async () => {
      await setup({ role: 'TECHNICIAN', board: of([rmaFactory({ id: 1, priority: 'HIGH' }), rmaFactory({ id: 2, status: 'TRIAGE' })]) });
      expect(normalized(indicator('Fila inicial'))).toContain('2 · 1 com prioridade alta');
      expect(normalized(indicator('Cadastros'))).toContain('0 clientes · 0 produtos');
      expect(normalized(indicator('Cadastros'))).not.toContain('usuários');
    });

    // Vermelho: com nota, o autor desaparece, e não há link.
    it('describes audit events like the RMA history', async () => {
      await setup({ board: of([rmaFactory({ statusHistory: [history('TRIAGE', '2026-10-21T16:00:00Z', 'Aguardando peça', 'ana')] })]) });
      const [entry] = audit();
      expect(normalized(entry)).toContain('Status registrado: Triagem');
      const pair = Array.from(entry.querySelectorAll('.meta-list div')).find((item) => normalized(item.querySelector('dt')) === 'Alterado por');
      expect(normalized(pair?.querySelector('dd'))).toBe('ana');
      expect(normalized(entry.querySelector('blockquote'))).toBe('Aguardando peça');
      expect(entry.querySelector('a.code-text')?.getAttribute('href')).toBe('/rmas?rma=1');
      expect(normalized(entry.querySelector('time'))).toBe('21/10/2026, 13:00');
    });

    // Vermelho: não há link nas entradas de auditoria.
    it('keeps distinct audit entries for the same RMA', async () => {
      await setup({ board: of([rmaFactory({ statusHistory: [history('RECEIVED', '2026-10-20T16:00:00Z'), history('TRIAGE', '2026-10-21T16:00:00Z')] })]) });
      // Preservação: as duas entradas já aparecem hoje.
      expect(audit().length).toBe(2);
      for (const entry of audit()) expect(entry.querySelector('a')?.getAttribute('href')).toBe('/rmas?rma=1');
    });

    it('preserves the four most recent audit events', async () => {
      const events = ['2026-10-20T16:00:00Z', '2026-10-21T16:00:00Z', '2026-10-22T16:00:00Z', '2026-10-23T16:00:00Z', '2026-10-24T16:00:00Z']
        .map((at) => history('TRIAGE', at));
      await setup({ board: of([rmaFactory({ statusHistory: events })]) });
      expect(audit().map((entry) => normalized(entry.querySelector('time')))).toEqual(['24/10/2026, 13:00', '23/10/2026, 13:00', '22/10/2026, 13:00', '21/10/2026, 13:00']);
    });

    // Vermelho: os códigos de “Últimos RMAs” não têm link.
    it('links recent RMAs', async () => {
      await setup();
      const link = tables()[1].querySelector('a[href="/rmas?rma=1"]');
      expect(normalized(link)).toBe('RMA-OPEN');
    });

    it('preserves the four most recently updated RMAs, closed included, and the empty owner', async () => {
      const board = [1, 2, 3, 4, 5].map((day) => rmaFactory({ id: day, code: `RMA-U${day}`, updatedAt: `2026-10-2${day}T16:00:00Z` }));
      board[4] = { ...board[4], status: 'COMPLETED' };
      await setup({ board: of(board) });
      const rows = Array.from(tables()[1].querySelectorAll('tbody tr'));
      expect(rows.map((row) => normalized(row.querySelector('td:first-child')))).toEqual(['RMA-U5', 'RMA-U4', 'RMA-U3', 'RMA-U2']);
      expect(normalized(rows[0].querySelector('.person'))).toBe('–Sem responsável');
      expect(normalized(rows[0].querySelector('.avatar'))).toBe('–');
    });
  });
});

function expectPending(root: HTMLElement): void {
  const busy = root.querySelector('[aria-busy="true"]');
  expect(busy?.textContent?.trim()).toBe('');
  expect(busy?.children.length).toBe(0);
  expect(busy?.hasAttribute('role')).toBe(false);
  expect(root.textContent).not.toMatch(/Carregando(?! opções)|Atualizando (estoque|notificações|preferências|regras|falhas)/);
}
