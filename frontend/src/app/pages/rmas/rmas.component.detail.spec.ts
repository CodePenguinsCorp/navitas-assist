import { signal } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DiagnosisResponse, RmaResponse, UserRole, UserSession, WarrantyStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { PartService } from '../../core/services/part.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { RmaService } from '../../core/services/rma.service';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { RmaPartsPanelComponent } from '../../shared/rma-parts-panel/rma-parts-panel.component';
import { buildRma, buildRmaItem, buildRmaPage } from '../../testing/rma-fixtures';
import { RmasComponent } from './rmas.component';

interface DetailHarness {
  openDetailsModal(rma: RmaResponse): void;
}

const NOW = Date.parse('2026-10-20T12:00:00Z');

const diagnosis: DiagnosisResponse = {
  id: 9, foundFailure: 'Capacitor estufado', failureType: 'POWER_SUPPLY', probableCause: 'COMPONENT',
  notes: 'Trocar lote', diagnosedAt: '2026-10-21', technicianName: 'Bia',
  createdAt: '2026-10-21T12:00:00Z', updatedAt: '2026-10-21T12:00:00Z'
};

const fullRma = buildRma({
  id: 5,
  code: 'RMA-2026-000005',
  clientName: 'Cliente X',
  items: [buildRmaItem({
    productName: 'Produto A', productSku: 'SKU-A', serialNumber: 'S1', batchNumber: null,
    warrantyMonths: 1, warrantyExpiresAt: null, warrantyStatus: WarrantyStatus.PENDING
  })],
  purchaseDate: null,
  purchaseDateUnknown: true,
  invoiceNumber: null,
  receivedAccessories: 'Fonte original',
  physicalCondition: 'Riscado na lateral',
  diagnosis,
  repairSummary: 'Troca do capacitor',
  replacedPartsSummary: 'Capacitor C12',
  testSummary: 'Bancada 2h sem falha',
  currentBlock: {
    id: 3, reason: 'Aguardando cliente', category: null, blockedBy: 'ana', blockedAt: '2026-10-20T10:00:00Z',
    resolvedBy: null, resolvedAt: null, resolutionNote: null
  },
  statusHistory: [
    { status: 'TRIAGE', changedBy: 'ana', changedAt: '2026-10-20T11:00:00Z', note: 'Prioridade alterada para Alta' }
  ],
  assignmentHistory: [
    { previousAssigneeId: null, previousAssigneeName: null, newAssigneeId: 7, newAssigneeName: 'Ana', changedBy: 'bia', changedAt: '2026-10-20T10:30:00Z' }
  ]
});

async function setup(options: { role?: UserRole } = {}) {
  const role = options.role ?? 'ADMIN';
  const rmaService = {
    list: vi.fn(() => of(buildRmaPage([fullRma], 0, 20, 1))),
    getSummary: vi.fn(() => of({ total: 1, ongoing: 1, highPriority: 0 })),
    getById: vi.fn(),
    create: vi.fn(),
    upsertDiagnosis: vi.fn()
  };
  const partService = {
    getRmaParts: vi.fn(() => of({ rmaId: 5, rmaCode: fullRma.code, reservations: [], movements: [], reservedCost: 0, consumedCost: 0, pendingCount: 0 })),
    list: vi.fn(() => of([]))
  };
  const protocolService = { listExecutions: vi.fn(() => of([])), listTemplates: vi.fn(() => of([])) };
  const currentUser = signal<UserSession | null>({ username: 'tester', name: 'Tester', role });
  await TestBed.configureTestingModule({
    imports: [RmasComponent],
    providers: [
      provideRouter([]),
      { provide: SlaClockService, useValue: { now: signal(NOW) } },
      { provide: AuthService, useValue: { currentUser: currentUser.asReadonly(), hasAnyRole: (roles: UserRole[]) => roles.includes(role) } },
      { provide: CatalogService, useValue: { listClientOptions: () => of([]), listProductOptions: () => of([]) } },
      { provide: RmaService, useValue: rmaService },
      { provide: PartService, useValue: partService },
      { provide: ProtocolService, useValue: protocolService }
    ]
  }).compileComponents();
  const fixture: ComponentFixture<RmasComponent> = TestBed.createComponent(RmasComponent);
  fixture.detectChanges();
  const component = fixture.componentInstance as unknown as DetailHarness;
  const page = fixture.nativeElement as HTMLElement;
  const render = () => fixture.detectChanges();
  const open = (rma: RmaResponse = fullRma) => {
    component.openDetailsModal(rma);
    render();
  };
  const detail = () => page.querySelector<HTMLElement>('.rma-details')!;
  const tab = (label: string) =>
    [...detail().querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) => button.textContent?.trim() === label)!;
  const selectTab = (label: string) => {
    tab(label).click();
    render();
  };
  const tabPanel = () => detail().querySelector<HTMLElement>('[role="tabpanel"]')!;
  /** dt/dd pairs of a meta-list, in order. */
  const pairs = (root: Element) =>
    [...root.querySelectorAll(':scope > div')].map((row) => [row.querySelector('dt')?.textContent?.trim(), row.querySelector('dd')?.textContent?.trim()]);
  const section = (title: string) =>
    [...tabPanel().querySelectorAll<HTMLElement>('.rma-details__section')].find((item) => item.querySelector('h4')?.textContent?.trim() === title) ?? null;

  return { fixture, page, render, open, detail, tab, selectTab, tabPanel, pairs, section, rmaService, partService, protocolService };
}

describe('RmasComponent detail with the shared information contract', () => {
  it('shows product as title, client below and the same status, priority and block formats', async () => {
    // Hoje o h3 mostra o cliente ("Cliente X") e a etiqueta de impedimento é só "Bloqueado".
    const { open, detail } = await setup();
    open();
    const identity = detail().querySelector('.rma-details__identity')!;

    expect(identity.querySelector('h3')?.textContent?.trim()).toBe('Produto A');
    expect(identity.querySelector('.rma-details__client')?.textContent?.trim()).toBe('Cliente X');
    expect(identity.querySelector('.status-chip[data-status="RECEIVED"]')?.textContent?.trim()).toBe('Recebido');
    expect(identity.querySelector('.priority-tag[data-priority="MEDIUM"] .priority-bars')).not.toBeNull();
    expect(identity.querySelector('.mini-chip.priority-high')?.textContent?.trim()).toBe('Bloqueado há 2h 0min');
  });

  it('stacks identity and actions on narrow screens and keeps Fechar in the header', async () => {
    // Hoje, em 320 px, o cabeçalho continua flex em linha e as ações (flex-shrink: 0) disputam a largura com a identidade.
    const { open, detail } = await setup();
    open();
    const header = detail().querySelector<HTMLElement>('.rma-details__header')!;
    const identity = header.querySelector<HTMLElement>(':scope > .rma-details__identity')!;
    const actions = header.querySelector<HTMLElement>(':scope > .rma-details__header-actions')!;
    const close = actions.querySelector<HTMLElement>('.modal-close')!;
    const diagnose = actions.querySelector<HTMLElement>('.button-primary')!;
    expect(identity).not.toBeNull();
    expect(close.getAttribute('aria-label')).toBe('Fechar');
    expect(diagnose.textContent?.trim()).toBe('Editar diagnóstico');
    expect(getComputedStyle(identity.querySelector('h3')!).overflowWrap).toBe('anywhere');

    // Computed styles are cached by the test DOM; connecting a <style> clears that cache after a resize.
    const resize = (width: number, height: number) => {
      (window as unknown as { happyDOM: { setViewport(size: { width: number; height: number }): void } }).happyDOM.setViewport({ width, height });
      document.head.appendChild(document.createElement('style')).remove();
    };
    try {
      resize(320, 640);
      expect(getComputedStyle(header).display).toBe('grid');
      expect(getComputedStyle(actions).display).toBe('contents');
      expect(getComputedStyle(close).getPropertyValue('grid-row')).toBe('1');
      expect(getComputedStyle(diagnose).getPropertyValue('grid-row')).toBe('2');
    } finally {
      resize(1024, 768);
    }
    expect(getComputedStyle(header).display).toBe('flex');
    expect(getComputedStyle(actions).display).toBe('flex');
  });

  it('lists the summary facts in contract order with SLA', async () => {
    // Hoje não há SLA, o rótulo é "Atualizado" e a compra vazia não marcada mostra "Não informado".
    const { open, detail, pairs, render, fixture } = await setup();
    open();
    const summary = detail().querySelector('.rma-details__summary')!;

    expect(pairs(summary).map(([label]) => label)).toEqual([
      'Produtos', 'Entrada', 'Nota fiscal', 'Compra', 'Responsável', 'SLA', 'Atualizado em'
    ]);
    expect(summary.querySelector('app-rma-sla-badge')).not.toBeNull();
    expect(Object.fromEntries(pairs(summary))).toEqual(expect.objectContaining({
      Produtos: '1 item', 'Nota fiscal': 'Não informada', Compra: 'Desconhecida'
    }));

    (fixture.componentInstance as unknown as DetailHarness).openDetailsModal({ ...fullRma, purchaseDateUnknown: false, purchaseDate: null });
    render();
    expect(Object.fromEntries(pairs(detail().querySelector('.rma-details__summary')!))['Compra']).toBe('Não informada');
  });

  it('shows warranty term, expiry and Recebimento in the Produtos tab', async () => {
    // Hoje o prazo é "1 meses", o vencimento sem compra diz "Informe a compra" e não há seção "Recebimento".
    const { open, section, pairs, tabPanel } = await setup();
    open();

    const products = section('Produtos')!;
    expect(products).not.toBeNull();
    expect(products.textContent).toContain('Garantia avaliada na entrada do RMA.');
    const item = products.querySelector('.rma-item-detail')!;
    expect(item.querySelector('.rma-item-detail__sku')?.textContent?.trim()).toBe('SKU-A');
    expect(pairs(item.querySelector('dl')!)).toEqual([
      ['Série', 'S1'], ['Lote', 'Não informado'], ['Prazo de garantia', '1 mês'], ['Vencimento', 'Sem data da compra']
    ]);
    expect(tabPanel().textContent).not.toContain('Informe a compra');
    expect(tabPanel().textContent).not.toContain('1 meses');

    const receipt = section('Recebimento')!;
    expect(receipt).not.toBeNull();
    expect(pairs(receipt.querySelector('dl')!)).toEqual([['Acessórios', 'Fonte original'], ['Condição física', 'Riscado na lateral']]);
  });

  it('hides Recebimento when nothing was recorded at receipt', async () => {
    // Hoje a seção não existe em nenhum caso; este teste fixa a ocultação sem dados.
    const { open, section } = await setup();
    open({ ...fullRma, receivedAccessories: null, physicalCondition: '  ' });

    expect(section('Produtos')).not.toBeNull();
    expect(section('Recebimento')).toBeNull();
  });

  it('shows the six diagnosis facts and Reparo e testes in the Diagnóstico tab', async () => {
    // Hoje a aba só mostra Falha encontrada, Tipo e Causa provável, sem data, técnico, notas e reparo.
    const { open, selectTab, tabPanel, pairs, section } = await setup();
    open();
    selectTab('Diagnóstico');

    expect(pairs(tabPanel().querySelector('.rma-details__pairs')!)).toEqual([
      ['Falha encontrada', 'Capacitor estufado'], ['Tipo', 'Fonte'], ['Causa provável', 'Componente'],
      ['Data do diagnóstico', '21/10/2026'], ['Técnico', 'Bia'], ['Notas', 'Trocar lote']
    ]);
    const repair = section('Reparo e testes')!;
    expect(repair).not.toBeNull();
    expect(pairs(repair.querySelector('dl')!)).toEqual([
      ['Reparo', 'Troca do capacitor'], ['Peças trocadas', 'Capacitor C12'], ['Testes', 'Bancada 2h sem falha']
    ]);
  });

  it('shows the empty diagnosis state with the contract label and keeps Reparo e testes', async () => {
    // Hoje o título do estado vazio é "Sem diagnóstico." e o reparo registrado na abertura não aparece.
    const { open, selectTab, tabPanel, section } = await setup();
    open({ ...fullRma, diagnosis: null });
    selectTab('Diagnóstico');

    expect(tabPanel().querySelector('.empty-state h3')?.textContent?.trim()).toBe('Sem diagnóstico registrado.');
    expect(section('Reparo e testes')).not.toBeNull();
  });

  it('shows status records and assignee changes in the Histórico tab, newest first', async () => {
    // Hoje a aba só lista trocas de responsável; o registro de status não aparece.
    const { open, selectTab, tabPanel } = await setup();
    open();
    selectTab('Histórico');

    const entries = [...tabPanel().querySelectorAll<HTMLElement>('ol.record-list > li')];
    expect(entries).toHaveLength(2);
    expect(entries[0].querySelector('.record-card__title strong')?.textContent?.trim()).toBe('Status registrado: Triagem');
    expect(entries[0].querySelector('blockquote')?.textContent?.trim()).toBe('Prioridade alterada para Alta');
    expect(entries[1].querySelector('.record-card__title strong')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Sem responsável → Ana');
    expect(entries[1].textContent).toContain('bia');
    expect(tabPanel().textContent).not.toContain('Moveu para');
  });

  it('shows the empty history message', async () => {
    // Hoje a mensagem é "Nenhuma alteração de responsável registrada.".
    const { open, selectTab, tabPanel } = await setup();
    open({ ...fullRma, statusHistory: [], assignmentHistory: [] });
    selectTab('Histórico');

    expect(tabPanel().textContent?.trim()).toBe('Nenhuma alteração registrada.');
  });

  // Preservação
  it('keeps the six tabs in order with tab semantics', async () => {
    const { open, detail, selectTab, render, fixture } = await setup();
    open();
    const tabs = () => [...detail().querySelectorAll<HTMLButtonElement>('[role="tablist"] [role="tab"]')];

    expect(tabs().map((tab) => tab.textContent?.trim())).toEqual(['Produtos', 'Diagnóstico', 'Peças', 'Protocolos', 'Impedimentos', 'Histórico']);
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
    expect(tabs().map((tab) => tab.getAttribute('aria-controls'))).toEqual([
      'rma-panel-products', 'rma-panel-diagnosis', 'rma-panel-parts', 'rma-panel-protocols', 'rma-panel-blocks', 'rma-panel-history'
    ]);
    selectTab('Histórico');
    expect(tabs()[5].getAttribute('aria-selected')).toBe('true');

    closeDetail(detail());
    render();
    (fixture.componentInstance as unknown as DetailHarness).openDetailsModal(fullRma);
    render();
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('renders parts, protocols and impediments panels in their tabs', async () => {
    const { open, selectTab, tabPanel, fixture, partService, protocolService } = await setup();
    open();

    selectTab('Peças');
    const [deferBlock] = await fixture.getDeferBlocks();
    await deferBlock.render(DeferBlockState.Complete);
    fixture.detectChanges();
    const parts = fixture.debugElement.query(By.directive(RmaPartsPanelComponent));
    expect(parts).not.toBeNull();
    expect(parts.componentInstance.rmaId()).toBe(5);
    expect(parts.componentInstance.rmaStatus()).toBe('RECEIVED');
    expect(partService.getRmaParts).toHaveBeenCalledWith(5);

    selectTab('Protocolos');
    // The protocols panel is imported on demand when the detail opens.
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(protocolService.listExecutions).toHaveBeenCalledWith(5);
    });

    selectTab('Impedimentos');
    expect(tabPanel().querySelector('app-rma-block-history')).not.toBeNull();
  });

  it.each([
    ['ADMIN', true],
    ['TECHNICIAN', true],
    ['SERVICE_DESK', false],
    ['VIEWER', false]
  ] as const)('keeps the diagnosis CTA only for ADMIN and TECHNICIAN (%s)', async (role, allowed) => {
    const { open, detail, selectTab, tabPanel } = await setup({ role });
    open({ ...fullRma, diagnosis: null });

    expect(detail().querySelector('.rma-details__header-actions .button-primary') !== null).toBe(allowed);
    selectTab('Diagnóstico');
    const cta = [...tabPanel().querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Registrar diagnóstico');
    expect(cta !== undefined).toBe(allowed);
  });
});

function closeDetail(detail: HTMLElement): void {
  detail.querySelector<HTMLButtonElement>('.modal-close')!.click();
}
