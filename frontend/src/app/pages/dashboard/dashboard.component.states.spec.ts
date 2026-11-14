import { HttpErrorResponse } from '@angular/common/http';
import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import {
  ClientSummaryResponse,
  ProductSummaryResponse,
  RmaResponse,
  UserSummaryResponse,
  WarrantyStatus
} from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { businessToday } from '../../core/utils/rma-deadline';
import { DashboardComponent } from './dashboard.component';
import { Permission } from '../../core/permissions';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';

function rmaFactory(overrides: Partial<RmaResponse> = {}): RmaResponse {
  return {
    id: 1, code: 'OS-OPEN', clientId: 1, clientName: 'Cliente',
    items: [{ id: 1, productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null,
      serialNumber: 'SER-2', manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: null, calculatedWarrantyStatus: WarrantyStatus.PENDING, warrantyOverride: null, warrantyStatus: WarrantyStatus.PENDING }],
    productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null, serialNumber: 'SER-2',
    manufacturedAt: null, purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-10-20',
    invoiceNumber: null, receivedBy: 'tester', reportedFailure: 'Falha', receivedAccessories: null,
    physicalCondition: null, priority: 'MEDIUM', status: 'RECEIVED', assigneeId: null, assigneeName: null,
    repairSummary: null, replacedPartsSummary: null, testSummary: null, shippedAt: null, carrier: null,
    trackingCode: null, diagnosis: null, assignmentHistory: [],
    statusHistory: [{ status: 'RECEIVED', changedBy: 'tester', changedAt: '2026-10-20T16:00:00Z', note: null }],
    currentBlock: null, blockHistory: [],
    dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null, daysUntilDue: null }, stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T16:00:00Z', leftAt: null, durationSeconds: 0 }], dueDateHistory: [], warrantyHistory: [],
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
    role?: LegacyProfileCode;
    permissions?: Signal<readonly Permission[]>;
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
        providePermissions(sources.permissions ?? profilePermissions(sources.role ?? 'TECHNICIAN')),
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
    expect(text()).not.toContain('Nenhuma OS em andamento.');
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
    expect(text()).not.toContain('Nenhuma OS em andamento.');
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
    expect(text()).toContain('OS-OPEN');
    expect(rmaService.listBoard).toHaveBeenCalledTimes(2);
    expect(catalogService.getClientSummary).toHaveBeenCalledTimes(2);
  });

  it.each(['TECHNICIAN', 'SERVICE_DESK', 'VIEWER'] as LegacyProfileCode[])('preserves a single unfiltered board request without user summary for %s', async (role) => {
    await setup({ role });
    expect(rmaService.listBoard).toHaveBeenCalledTimes(1);
    expect(rmaService.listBoard).toHaveBeenCalledWith();
    expect(catalogService.getUserSummary).not.toHaveBeenCalled();
  });

  describe('composition', () => {
    const IN_WARRANTY_ITEM = { ...RMA_OPEN.items[0], id: 7, calculatedWarrantyStatus: WarrantyStatus.IN_WARRANTY, warrantyOverride: null, warrantyStatus: WarrantyStatus.IN_WARRANTY };
    const RMA_CLOSED = rmaFactory({ id: 9, code: 'OS-CLOSED', status: 'COMPLETED', priority: 'HIGH', entryDate: '2026-01-01', items: [IN_WARRANTY_ITEM] });
    const OPEN_2 = rmaFactory({ id: 2 });
    const tables = () => root().querySelectorAll('table');
    const panelOf = (element: Element) => element.closest('.panel') as HTMLElement;
    const indicator = (label: string) => Array.from(root().querySelectorAll('ul[aria-label="Indicadores do dashboard"] > li'))
      .find((item) => item.textContent?.includes(label)) as HTMLElement | undefined;
    const normalized = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const audit = () => Array.from(root().querySelectorAll<HTMLElement>('li.timeline-entry'));
    const history = (status: RmaResponse['status'], changedAt: string, note: string | null = null, changedBy = 'tester') => ({ status, changedBy, changedAt, note });

    // Vermelho: `queue` ordena todos os registros, inclusive encerrados, e não há link.
    it('keeps closed ordens de serviço out of the priority queue and links each code', async () => {
      await setup({ board: of([RMA_CLOSED, OPEN_2]) });
      const queue = tables()[0];
      expect(normalized(queue)).not.toContain('OS-CLOSED');
      expect(queue.querySelector('a')?.getAttribute('href')).toBe('/rmas?rma=2');
      expect(normalized(panelOf(queue).querySelector('h3'))).toContain('Fila prioritária');
      expect(text()).not.toContain('primeiros de');
    });

    // Vermelho: não há legenda de escopo quando a fila é limitada a cinco.
    it('states how many active ordens de serviço the queue shows', async () => {
      const active = Array.from({ length: 7 }, (_, index) => rmaFactory({ id: index + 1, code: `OS-${index + 1}` }));
      await setup({ board: of([RMA_CLOSED, ...active]) });
      expect(text()).toContain('5 primeiras de 7 ordens de serviço em andamento');
      expect(tables()[0].querySelectorAll('tbody tr').length).toBe(5);
    });

    // Vermelho: com apenas encerrados, a fila mostra o encerrado em vez do vazio de RMAs em andamento.
    it('shows an empty active queue when every OS is closed', async () => {
      await setup({ board: of([RMA_CLOSED]) });
      expect(text()).toContain('Nenhuma OS em andamento.');
    });

    it('preserves the queue order by priority and oldest entry', async () => {
      await setup({ board: of([
        rmaFactory({ id: 1, code: 'OS-MED-NEW', priority: 'MEDIUM', entryDate: '2026-10-22' }),
        rmaFactory({ id: 2, code: 'OS-LOW', priority: 'LOW', entryDate: '2026-10-01' }),
        rmaFactory({ id: 3, code: 'OS-HIGH', priority: 'HIGH', entryDate: '2026-10-25' }),
        rmaFactory({ id: 4, code: 'OS-MED-OLD', priority: 'MEDIUM', entryDate: '2026-10-10' })
      ]) });
      const codes = Array.from(tables()[0].querySelectorAll('tbody tr td:first-child .code-text')).map((item) => item.textContent?.trim());
      expect(codes).toEqual(['OS-HIGH', 'OS-MED-OLD', 'OS-MED-NEW', 'OS-LOW']);
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
      expect(normalized(indicator('Ordens de serviço em andamento'))).toContain('1 de 2 registradas');
      const warranty = normalized(indicator('Itens em garantia'));
      // Preservação: o percentual de 50% já existe hoje.
      expect(warranty).toContain('50%');
      expect(warranty).toContain('1 de 2 itens · 1 pendente');
      expect(warranty).toContain('em todas as ordens de serviço registradas');
      expect(normalized(indicator('Cadastros'))).toContain('3 clientes · 4 produtos · 2 usuários');
      expect(normalized(indicator('Cadastros'))).not.toContain('9');
      expect(root().querySelector('.meter')).toBeNull();
    });

    // Vermelho: a lista de indicadores e o formato `X · Y com prioridade alta` não existem.
    // Preservação: o cálculo da fila inicial e a ausência de usuários para quem não é ADMIN.
    it('counts Atrasadas and Perto do limite among open ordens de serviço only', async () => {
      const today = businessToday(Date.now());
      const shift = (days: number) => {
        const [y, m, d] = today.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
      };
      const due = (id: number, days: number, status: RmaResponse['status'] = 'IN_REPAIR') => rmaFactory({
        id, status, entryDate: '2000-01-01', dueDate: shift(days),
        deadline: { status: 'ON_TRACK', dueSoonFrom: shift(days - 7), daysUntilDue: null }
      });
      await setup({ board: of([due(1, -3), due(2, -1), due(3, 2), due(4, 30), due(5, -9, 'COMPLETED'), rmaFactory({ id: 6 })]) });
      const card = indicator('Atrasadas')!;
      expect(normalized(card.querySelector('.dashboard-summary__value'))).toBe('2 · 1 perto do limite');
      expect(card.getAttribute('data-tone')).toBe('danger');
      const labels = Array.from(root().querySelectorAll('ul[aria-label="Indicadores do dashboard"] > li .dashboard-summary__label')).map((item) => item.textContent?.trim());
      expect(labels[1]).toBe('Atrasadas');
    });

    it('keeps the catalog card style regardless of position', async () => {
      await setup();
      const items = Array.from(root().querySelectorAll<HTMLElement>('ul[aria-label="Indicadores do dashboard"] > li'));
      expect(items.map((item) => item.getAttribute('data-tone'))).toEqual(['brand', 'danger', 'sky', 'success', 'violet']);
      expect(items.filter((item) => item.classList.contains('dashboard-summary__item--catalog')).map((item) => normalized(item.querySelector('.dashboard-summary__label'))))
        .toEqual(['Cadastros']);
    });

    it('keeps the initial queue indicator and omits users for non-admin profiles', async () => {
      await setup({ role: 'TECHNICIAN', board: of([rmaFactory({ id: 1, priority: 'HIGH' }), rmaFactory({ id: 2, status: 'TRIAGE' })]) });
      expect(normalized(indicator('Fila inicial'))).toContain('2 · 1 com prioridade alta');
      expect(normalized(indicator('Cadastros'))).toContain('0 clientes · 0 produtos');
      expect(normalized(indicator('Cadastros'))).not.toContain('usuários');
    });

    it('follows the users permission when it changes', async () => {
      const permissions = signal<readonly Permission[]>(profilePermissions('ADMIN'));
      await setup({ permissions, users: of({ ...USERS, total: 2 }) });
      expect(normalized(indicator('Cadastros'))).toContain('2 usuários');

      permissions.set(profilePermissions('TECHNICIAN'));
      fixture.detectChanges();
      expect(normalized(indicator('Cadastros'))).not.toContain('usuários');
    });

    // Vermelho: com nota, o autor desaparece, e não há link.
    it('describes audit events like the OS history', async () => {
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
    it('keeps distinct audit entries for the same OS', async () => {
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
    it('links recent ordens de serviço', async () => {
      await setup();
      const link = tables()[1].querySelector('a[href="/rmas?rma=1"]');
      expect(normalized(link)).toBe('OS-OPEN');
    });

    it('preserves the four most recently updated ordens de serviço, closed included, and the empty owner', async () => {
      const board = [1, 2, 3, 4, 5].map((day) => rmaFactory({ id: day, code: `OS-U${day}`, updatedAt: `2026-10-2${day}T16:00:00Z` }));
      board[4] = { ...board[4], status: 'COMPLETED' };
      await setup({ board: of(board) });
      const rows = Array.from(tables()[1].querySelectorAll('tbody tr'));
      expect(rows.map((row) => normalized(row.querySelector('td:first-child')))).toEqual(['OS-U5', 'OS-U4', 'OS-U3', 'OS-U2']);
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
