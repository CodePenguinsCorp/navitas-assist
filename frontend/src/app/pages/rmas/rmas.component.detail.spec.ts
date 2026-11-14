import { RmaWarrantyFieldComponent } from '../../shared/rma-warranty-field/rma-warranty-field.component';
import { signal } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DiagnosisResponse, RmaResponse, UserSession, WarrantyStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { LoadingService } from '../../core/services/loading.service';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { PartService } from '../../core/services/part.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { RmaService } from '../../core/services/rma.service';
import { ClockService } from '../../core/services/clock.service';
import { RmaPartsPanelComponent } from '../../shared/rma-parts-panel/rma-parts-panel.component';
import { buildRma, buildRmaItem, buildRmaPage } from '../../testing/rma-fixtures';
import { RmasComponent } from './rmas.component';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { settleRmaLazyChunks } from '../../testing/lazy-chunks';

interface DetailHarness {
  openDetailsModal(rma: RmaResponse): void;
}

const NOW = Date.parse('2026-10-20T12:00:00Z');

const diagnosis: DiagnosisResponse = {
  foundFailure: 'Capacitor estufado', failureType: 'POWER_SUPPLY', probableCause: 'COMPONENT',
  notes: 'Trocar lote', diagnosedAt: '2026-10-21', technicianName: 'Bia',
};

const fullRma = buildRma({
  id: 5,
  code: 'OS-2026-000005',
  clientName: 'Cliente X',
  items: [buildRmaItem({
    productName: 'Produto A', productSku: 'SKU-A', serialNumber: 'S1', batchNumber: null,
    warrantyMonths: 1, warrantyExpiresAt: null, calculatedWarrantyStatus: WarrantyStatus.PENDING, warrantyOverride: null, warrantyStatus: WarrantyStatus.PENDING
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
    { previousAssigneeName: null, newAssigneeName: 'Ana', changedBy: 'bia', changedAt: '2026-10-20T10:30:00Z' }
  ]
});

async function setup(options: { role?: LegacyProfileCode } = {}) {
  const role = options.role ?? 'ADMIN';
  const rmaService = {
    list: vi.fn(() => of(buildRmaPage([fullRma], 0, 20, 1))),
    getSummary: vi.fn(() => of({ total: 1, ongoing: 1, highPriority: 0 })),
    getById: vi.fn(),
    create: vi.fn(),
    upsertDiagnosis: vi.fn(),
    resolveBlock: vi.fn((id: number, blockId: number, body: { resolutionNote: string }) => of({
      ...fullRma, id, currentBlock: null,
      blockHistory: [{ ...fullRma.currentBlock!, id: blockId, resolvedBy: 'tester', resolvedAt: '2026-10-20T11:50:00Z', resolutionNote: body.resolutionNote }]
    }))
  };
  const partService = {
    getRmaParts: vi.fn(() => of({ rmaId: 5, rmaCode: fullRma.code, reservations: [], movements: [], reservedCost: 0, consumedCost: 0, pendingCount: 0 })),
    listOptions: vi.fn(() => of([]))
  };
  const protocolService = { listExecutions: vi.fn(() => of([])), listTemplates: vi.fn(() => of([])) };
  const currentUser = signal<UserSession | null>({ username: 'tester', name: 'Tester', profileName: 'Perfil', permissions: [] });
  await TestBed.configureTestingModule({
    imports: [RmasComponent],
    providers: [
      provideRouter([]),
      { provide: ClockService, useValue: { now: signal(NOW) } },
      providePermissions(profilePermissions(role)),
      { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      { provide: CatalogService, useValue: { listClientOptions: () => of([]), listProductOptions: () => of([]) } },
      { provide: RmaService, useValue: rmaService },
      { provide: PartService, useValue: partService },
      { provide: RmaRepairService, useValue: { listExternalComponents: () => of([]), getRepair: () => of({ interventions: [], totalServiceHours: 0 }) } },
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

// Waits for the lazy chunks the detail view starts, so none is pending at environment teardown.
afterEach(settleRmaLazyChunks);

describe('RmasComponent detail with the shared information contract', () => {
  it('renders the shared interventions panel in diagnosis without legacy repair summaries', async () => {
    const { open, selectTab, tabPanel, fixture } = await setup();
    open({ ...fullRma, repairSummary: null, replacedPartsSummary: null, testSummary: null }); selectTab('Diagnóstico');
    const [block] = await fixture.getDeferBlocks(); await block.render(DeferBlockState.Complete); fixture.detectChanges();
    expect(tabPanel().querySelector('app-rma-repair-panel')).not.toBeNull();
    expect(tabPanel().textContent).toContain('Intervenções'); expect(tabPanel().textContent).toContain('Nenhuma intervenção'); expect(tabPanel().textContent).not.toContain('Total de horas');
  });

  it('follows the Kanban detail: code bar, product title, client, status row with the block flag and priority among the facts', async () => {
    const { open, detail, pairs, tabPanel, render } = await setup();
    open();
    const head = detail().querySelector('.rma-details__head')!;
    const actions = detail().querySelector<HTMLElement>('.detail-actions')!;

    expect(detail().querySelector('.rma-details__header > .rma-details__code')?.textContent?.trim()).toBe('OS-2026-000005');
    expect(head.querySelector('h3')?.textContent?.trim()).toBe('Produto A');
    expect(head.querySelector('.rma-details__client')?.textContent?.trim()).toBe('Cliente X');
    expect(actions.querySelector('[data-status="RECEIVED"]')?.textContent?.trim()).toBe('Recebida');
    expect(actions.querySelector('app-rma-priority-field')).toBeNull();
    const summary = detail().querySelector('.rma-details__summary')!;
    expect(summary.querySelector('app-rma-priority-field [data-priority="MEDIUM"] .priority-bars[data-priority="MEDIUM"]')).not.toBeNull();
    expect(Object.fromEntries(pairs(summary)).Prioridade).toContain('Média');

    const flag = actions.querySelector<HTMLButtonElement>('button.detail-block-flag')!;
    expect(flag.textContent?.replace(/\s+/g, ' ').trim()).toBe('Impedida há 2 h · ver impedimento');
    expect(flag.querySelector('app-icon')).not.toBeNull();
    expect(flag.getAttribute('aria-controls')).toBe('rma-detail-panel');
    expect(detail().querySelector('.mini-chip.priority-high')).toBeNull();
    flag.click();
    render();
    expect(tabPanel().querySelector('.blocks-section__current')?.textContent).toContain('Aguardando cliente');
  });

  it('hides the block flag when the OS has no current block', async () => {
    const { open, detail } = await setup();
    open({ ...fullRma, currentBlock: null });
    expect(detail().querySelector('.detail-actions .detail-block-flag')).toBeNull();
  });

  it('offers the PDF report as a quiet text link in the header actions', async () => {
    const { open, detail } = await setup();
    open();
    const link = detail().querySelector<HTMLButtonElement>('.rma-details__header-actions app-rma-report-link button')!;
    expect(link.textContent).toContain('Laudo (PDF)');
    expect(link.className).toContain('link-button');
  });

  it('stacks identity and actions on narrow screens and keeps Fechar in the header', async () => {
    // Hoje, em 320 px, o cabeçalho continua flex em linha e as ações (flex-shrink: 0) disputam a largura com a identidade.
    const { open, detail } = await setup();
    open();
    const header = detail().querySelector<HTMLElement>('.rma-details__header')!;
    const code = header.querySelector<HTMLElement>(':scope > .rma-details__code')!;
    const actions = header.querySelector<HTMLElement>(':scope > .rma-details__header-actions')!;
    const close = actions.querySelector<HTMLElement>('.modal-close')!;
    expect(actions.querySelector('.button-primary')).toBeNull();
    expect(code).not.toBeNull();
    expect(close.getAttribute('aria-label')).toBe('Fechar');
    expect(getComputedStyle(detail().querySelector('.rma-details__head h3')!).overflowWrap).toBe('anywhere');

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
    } finally {
      resize(1024, 768);
    }
    expect(getComputedStyle(header).display).toBe('flex');
    expect(getComputedStyle(actions).display).toBe('flex');
  });

  it('lists the summary facts in contract order with Data limite and Nesta etapa', async () => {
    const { open, detail, pairs, render, fixture } = await setup();
    open();
    const summary = detail().querySelector('.rma-details__summary')!;

    expect(pairs(summary).map(([label]) => label)).toEqual([
      'Produtos', 'Entrada', 'Nota fiscal', 'Compra', 'Responsável', 'Prioridade', 'Data limite', 'Nesta etapa', 'Atualizado em'
    ]);
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
    expect(products.textContent).toContain('Garantia avaliada na entrada da OS.');
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

    expect(pairs(tabPanel().querySelector('app-rma-diagnosis dl')!)).toEqual([
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

    expect(tabPanel().querySelector('app-rma-diagnosis')?.textContent).toContain('Sem diagnóstico registrado.');
    expect(section('Reparo e testes')).not.toBeNull();
  });

  it('shows the empty diagnosis with a text action in the card', async () => {
    const { open, selectTab, tabPanel } = await setup();
    open({ ...fullRma, diagnosis: null }); selectTab('Diagnóstico');
    const editor = tabPanel().querySelector('app-rma-diagnosis')!;
    expect(editor.textContent).toContain('Sem diagnóstico registrado.');
    expect(editor.querySelector('button.link-button')?.textContent?.trim()).toBe('Registrar diagnóstico');
    expect(editor.querySelector('.panel, .detail-card')).toBeNull();
  });

  it('separates header, summary card, raised tabs and the white content card over the tinted canvas', async () => {
    const { open, detail, tabPanel } = await setup();
    open();
    const summary = detail().querySelector('.rma-details__summary')!;
    const deadline = [...summary.querySelectorAll(':scope > div')].find((row) => row.querySelector('dt')?.textContent?.trim() === 'Data limite')!;

    expect(detail().classList).toContain('detail-surface');
    expect(summary.classList).toContain('detail-card');
    expect(summary.classList).toContain('detail-summary');
    expect(deadline.classList).toContain('detail-summary__wide');
    expect(detail().querySelector('[role="tablist"]')!.classList).toContain('tab-list--raised');
    expect(tabPanel().classList).toContain('detail-card');
    const owner = summary.querySelector('.person > span:last-child')!;
    expect(owner.getAttribute('title')).toBe(owner.textContent?.trim());
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

    expect(tabPanel().querySelector('.rma-detail-copy')?.textContent?.trim()).toBe('Nenhuma alteração registrada.');
    expect(tabPanel().querySelector('ol.record-list')).toBeNull();
  });

  it('shows Sem data limite when there is none', async () => {
    const { open, detail, pairs } = await setup();
    open({ ...fullRma, dueDate: null });
    const summary = detail().querySelector('.rma-details__summary')!;
    expect(Object.fromEntries(pairs(summary))['Data limite']).toContain('Sem data limite');
    const row = [...summary.querySelectorAll(':scope > div')].find((item) => item.querySelector('dt')?.textContent?.trim() === 'Data limite')!;
    expect(row.querySelector('dd')?.classList).toContain('is-empty');
  });

  it('shows the date and Atrasado há 2 dias', async () => {
    const { open, detail } = await setup();
    open({ ...fullRma, dueDate: '2026-10-18', deadline: { status: 'OVERDUE', dueSoonFrom: '2026-10-11' } });
    const summary = detail().querySelector('.rma-details__summary')!;
    expect(summary.textContent).toContain('18/10/2026');
    const chip = summary.querySelector('.deadline-chip');
    expect(chip?.textContent?.trim()).toBe('Atrasado há 2 dias');
    expect(chip?.getAttribute('data-deadline')).toBe('OVERDUE');
  });

  it('makes the due date value clickable only with rma.editar and saves it inline', async () => {
    let view = await setup({ role: 'TECHNICIAN' });
    view.open();
    expect([...view.detail().querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Alterar')).toBe(false);
    expect(view.detail().querySelector('.rma-details__deadline .due-date-field__trigger')).toBeNull();
    expect(view.detail().querySelector('.rma-details__deadline')?.textContent).toContain('Sem data limite');
    TestBed.resetTestingModule();

    view = await setup({ role: 'ADMIN' });
    const updated = { ...fullRma, dueDate: '2026-10-30' };
    const updateDueDate = vi.fn(() => of(updated));
    (view.rmaService as unknown as { updateDueDate: typeof updateDueDate }).updateDueDate = updateDueDate;
    view.rmaService.list.mockReturnValue(of(buildRmaPage([updated], 0, 20, 1)));
    view.open();
    const deadline = view.detail().querySelector<HTMLElement>('.rma-details__deadline')!;
    expect([...deadline.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Alterar')).toBe(false);
    deadline.querySelector<HTMLButtonElement>('.due-date-field__trigger')!.click();
    view.render();
    expect(view.page.querySelector('app-rma-due-date-dialog, .modal-panel--narrow')).toBeNull();
    const input = deadline.querySelector<HTMLInputElement>('input[type="date"]')!;
    input.value = '2026-10-30';
    input.dispatchEvent(new Event('input'));
    input.closest('form')!.dispatchEvent(new Event('submit'));
    view.render();
    expect(updateDueDate).toHaveBeenCalledWith(5, '2026-10-30');
    expect(deadline.querySelector('input[type="date"]')).toBeNull();
    expect(view.detail().querySelector('.rma-details__summary')?.textContent).toContain('30/10/2026');
  });

  it('shows há 2 d 4 h in Nesta etapa and Encerrada em for closed ordens de serviço', async () => {
    const { open, detail, pairs } = await setup();
    open({ ...fullRma, stagePeriods: [{ status: 'TRIAGE', enteredAt: '2026-10-18T08:00:00Z', leftAt: null, durationSeconds: 0 }] });
    expect(Object.fromEntries(pairs(detail().querySelector('.rma-details__summary')!))['Nesta etapa']).toBe('há 2 d 4 h');
    open({ ...fullRma, status: 'COMPLETED', stagePeriods: [{ status: 'COMPLETED', enteredAt: '2026-10-19T13:00:00Z', leftAt: null, durationSeconds: 0 }] });
    expect(Object.fromEntries(pairs(detail().querySelector('.rma-details__summary')!))['Nesta etapa']).toBe('Encerrada em 19/10/2026 10:00');
  });

  it('lists the time of each previous stage in Histórico', async () => {
    const { open, selectTab, tabPanel } = await setup();
    open({
      ...fullRma,
      stagePeriods: [
        { status: 'RECEIVED', enteredAt: '2026-10-20T08:00:00Z', leftAt: '2026-10-20T10:00:00Z', durationSeconds: 7200 },
        { status: 'TRIAGE', enteredAt: '2026-10-20T10:00:00Z', leftAt: null, durationSeconds: 0 }
      ]
    });
    selectTab('Histórico');
    const lines = [...tabPanel().querySelectorAll('app-rma-stage-times li')].map((item) => item.textContent?.trim());
    expect(lines).toEqual(['Recebida · 2 h', 'Triagem · 2 h (atual)']);
  });

  it('shows due date changes with previous value and author', async () => {
    const { open, selectTab, tabPanel } = await setup();
    open({ ...fullRma, dueDateHistory: [{ previousDueDate: '2026-11-20', newDueDate: '2026-11-25', changedBy: 'carla', changedAt: '2026-10-20T11:30:00Z' }] });
    selectTab('Histórico');
    const entries = [...tabPanel().querySelectorAll<HTMLElement>('ol.record-list > li')];
    expect(entries[0].querySelector('.record-card__title strong')?.textContent?.trim()).toBe('Data limite 20/11/2026 → 25/11/2026');
    expect(entries[0].textContent).toContain('carla');
  });

  // Preservação
  it('keeps the six tabs in order with tab semantics', async () => {
    const { open, detail, selectTab, render, fixture } = await setup();
    open();
    const tabs = () => [...detail().querySelectorAll<HTMLButtonElement>('[role="tablist"] [role="tab"]')];

    expect(tabs().map((tab) => tab.textContent?.trim())).toEqual(['Produtos', 'Diagnóstico', 'Peças', 'Protocolos', 'Impedimentos', 'Histórico']);
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
    // The only panel rendered is the active one, so every tab controls the same stable id.
    expect(tabs().map((tab) => tab.getAttribute('aria-controls'))).toEqual(Array(6).fill('rma-detail-panel'));
    expect(detail().querySelector('[role="tabpanel"]')?.id).toBe('rma-detail-panel');
    selectTab('Histórico');
    expect(tabs()[5].getAttribute('aria-selected')).toBe('true');

    closeDetail(detail());
    render();
    (fixture.componentInstance as unknown as DetailHarness).openDetailsModal(fullRma);
    render();
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });

  // Novo: mesmo contrato das abas de notificações
  describe('tab keyboard', () => {
    async function openTabs() {
      const harness = await setup();
      harness.open();
      const tabs = () => [...harness.detail().querySelectorAll<HTMLButtonElement>('[role="tablist"] [role="tab"]')];
      const press = (key: string) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        (document.activeElement as HTMLElement).dispatchEvent(event);
        harness.render();
        return event;
      };
      const expectActive = (index: number) => {
        expect(document.activeElement, 'focus follows the selected tab').toBe(tabs()[index]);
        expect(tabs().map((tab) => tab.getAttribute('aria-selected') === 'true')).toEqual(tabs().map((_, i) => i === index));
        expect(harness.tabPanel().getAttribute('aria-labelledby')).toBe(tabs()[index].id);
      };
      return { ...harness, tabs, press, expectActive };
    }

    it('wraps with the arrows and selects the tab that receives focus', async () => {
      const { tabs, press, expectActive } = await openTabs();
      tabs()[0].focus();
      expect(press('ArrowLeft').defaultPrevented).toBe(true);
      expectActive(5);
      expect(press('ArrowRight').defaultPrevented).toBe(true);
      expectActive(0);
      press('ArrowRight');
      expectActive(1);
      press('ArrowLeft');
      expectActive(0);
    });

    it('jumps to the first and last tabs with Home and End', async () => {
      const { tabs, press, expectActive } = await openTabs();
      tabs()[2].click();
      tabs()[2].focus();
      expect(press('End').defaultPrevented).toBe(true);
      expectActive(5);
      expect(press('Home').defaultPrevented).toBe(true);
      expectActive(0);
    });

    it('moves from the active tab into its panel with Tab, even when the panel has only static content', async () => {
      const { tabs, press, selectTab, tabPanel } = await openTabs();
      selectTab('Histórico');
      tabs()[5].focus();
      press('Tab');
      expect(document.activeElement, 'Tab enters the panel').toBe(tabPanel());
      expect(tabPanel().getAttribute('tabindex')).toBe('0');
      expect(tabPanel().getAttribute('aria-labelledby')).toBe(tabs()[5].id);
    });

    it('keeps only the active tab in the Tab order and leaves other keys alone', async () => {
      const { tabs, press, selectTab } = await openTabs();
      expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1']);
      selectTab('Peças');
      expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '-1', '0', '-1', '-1', '-1']);
      tabs()[2].focus();
      expect(press('ArrowDown').defaultPrevented).toBe(false);
      expect(press('a').defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(tabs()[2]);
    });
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
    expect(tabPanel().querySelector('app-rma-blocks-section')).not.toBeNull();
  });

  it('resolves the current impediment inline in its tab, like the Kanban detail', async () => {
    const { open, selectTab, tabPanel, detail, render, rmaService } = await setup();
    open();
    selectTab('Impedimentos');
    expect(tabPanel().querySelector('.blocks-section__current')?.textContent).toContain('Aguardando cliente');
    expect(detail().querySelector('dialog, app-rma-block-panel')).toBeNull();
    const listCalls = rmaService.list.mock.calls.length;
    // The refreshed list already carries the resolved RMA, as the server would return it.
    rmaService.list.mockImplementation(() => of(buildRmaPage([{ ...fullRma, currentBlock: null }], 0, 20, 1)));
    [...tabPanel().querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'Resolver')!.click();
    render();
    const note = tabPanel().querySelector<HTMLTextAreaElement>('#rma-block-resolution')!;
    note.value = 'Cliente respondeu';
    note.dispatchEvent(new Event('input'));
    note.closest('form')!.dispatchEvent(new Event('submit'));
    render();

    expect(rmaService.resolveBlock).toHaveBeenCalledWith(5, 3, { resolutionNote: 'Cliente respondeu' });
    expect(tabPanel().querySelector('.blocks-section__empty')?.textContent?.trim()).toBe('Sem impedimento');
    expect(detail().querySelector('.detail-actions .detail-block-flag')).toBeNull();
    expect(rmaService.list.mock.calls.length).toBeGreaterThan(listCalls);
  });

  it.each([
    ['ADMIN', true],
    ['TECHNICIAN', true],
    ['SERVICE_DESK', false],
    ['VIEWER', false]
  ] as const)('keeps the diagnosis CTA only for ADMIN and TECHNICIAN (%s)', async (role, allowed) => {
    const { open, detail, selectTab, tabPanel } = await setup({ role });
    open({ ...fullRma, diagnosis: null });

    expect(detail().querySelector('.rma-details__header-actions .button-primary')).toBeNull();
    selectTab('Diagnóstico');
    const cta = [...tabPanel().querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Registrar diagnóstico');
    expect(cta !== undefined).toBe(allowed);
  });
});

function closeDetail(detail: HTMLElement): void {
  detail.querySelector<HTMLButtonElement>('.modal-close')!.click();
}

describe('RmasComponent detail dialog focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function focusSetup() {
    const context = await setup();
    const loading = TestBed.inject(LoadingService);
    const render = () => {
      context.fixture.detectChanges();
      TestBed.tick();
    };
    const openFromRow = () => {
      const row = context.page.querySelector<HTMLElement>('.rma-table-row')!;
      row.focus();
      row.click();
      render();
      return row;
    };
    const dialog = () => context.page.querySelector<HTMLElement>('.rma-details[role="dialog"]');
    const listRegion = () => context.page.querySelector<HTMLElement>('.table-card')!;
    const escape = () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      (document.activeElement ?? document.body).dispatchEvent(event);
      render();
      return event;
    };
    const showOverlay = () => { loading.start(); vi.advanceTimersByTime(200); render(); };
    const hideOverlay = () => { loading.finish(); vi.advanceTimersByTime(400); render(); };
    render();
    return { ...context, render, openFromRow, dialog, listRegion, escape, showOverlay, hideOverlay };
  }

  it('focuses the detail panel from its row and returns to the row on Escape', async () => {
    const { dialog, openFromRow, escape } = await focusSetup();
    const row = openFromRow();
    expect(document.activeElement).toBe(dialog());
    expect(escape().defaultPrevented).toBe(true);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('falls back to the list when the detail was opened without a trigger', async () => {
    const { open, render, dialog, listRegion, escape } = await focusSetup();
    (document.activeElement as HTMLElement | null)?.blur();
    open();
    render();
    expect(document.activeElement).toBe(dialog());
    escape();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(listRegion());
  });

  it('defers the return to the row until the global overlay hides', async () => {
    const { dialog, openFromRow, showOverlay, hideOverlay, render } = await focusSetup();
    const row = openFromRow();
    showOverlay();
    const focus = vi.spyOn(row, 'focus');
    closeDetail(dialog()!);
    render();
    expect(dialog()).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    hideOverlay();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(row);
  });
});


describe('garantia no detalhe da lista', () => {
  it.each(['ADMIN', 'VIEWER'] as const)('respeita rma.editar no perfil %s', async (role) => {
    const { open, detail } = await setup({ role }); open();
    expect(detail().querySelectorAll('app-rma-warranty-field').length).toBe(1);
    expect(detail().querySelector('.warranty-field__trigger') !== null).toBe(profilePermissions(role).includes('rma.editar'));
  });
  it('atualiza o detalhe com a resposta emitida pelo campo compartilhado', async () => {
    const { open, fixture, detail, rmaService } = await setup(); open();
    const updated = { ...fullRma, items: [buildRmaItem({ warrantyStatus: WarrantyStatus.IN_WARRANTY })] };
    // The list reloads after a save, so the refreshed page already carries the saved RMA.
    rmaService.list.mockReturnValue(of(buildRmaPage([updated], 0, 20, 1)));
    const field = fixture.debugElement.query(By.directive(RmaWarrantyFieldComponent)).componentInstance as RmaWarrantyFieldComponent;
    field.saved.emit(updated); fixture.detectChanges();
    expect(detail().querySelector('app-rma-warranty-field')!.textContent).toContain('Em garantia');
  });
  it('mostra eventos de ajuste e remoção junto dos demais registros', async () => {
    const { open, selectTab, tabPanel } = await setup();
    open({ ...fullRma, warrantyHistory: [{ itemId: 1, previousOverride: null, newOverride: WarrantyStatus.OUT_OF_WARRANTY,
      reason: 'Mau uso', changedBy: 'carla', changedAt: '2026-11-13T12:00:00Z' }] });
    selectTab('Histórico'); const history = tabPanel().querySelector('.record-card')!;
    expect(history.textContent).toContain('Garantia de Produto A (SKU-A): Automático → Fora de garantia');
    expect(history.textContent).toContain('Mau uso'); expect(history.textContent).toContain('carla');
  });
});

describe('RmasComponent detail priority selector', () => {
  it.each(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER'] as const)('offers the selector only with rma.editar (%s)', async (role) => {
    const { open, detail } = await setup({ role });
    open();
    const field = detail().querySelector('.rma-details__summary app-rma-priority-field')!;
    expect(field.querySelector('.custom-select__trigger') !== null).toBe(profilePermissions(role).includes('rma.editar'));
    expect(field.textContent).toContain('Média');
  });

  it('keeps the priority read only for a closed OS', async () => {
    const { open, detail } = await setup();
    open({ ...fullRma, status: 'RETURNED' });
    expect(detail().querySelector('app-rma-priority-field .custom-select__trigger')).toBeNull();
    expect(detail().querySelector('app-rma-priority-field .priority-tag')?.textContent?.trim()).toBe('Média');
  });

  it('saves the chosen priority right away and refreshes the detail and the list', async () => {
    const view = await setup();
    const updated = { ...fullRma, priority: 'HIGH' as const };
    const updatePriority = vi.fn(() => of(updated));
    (view.rmaService as unknown as { updatePriority: typeof updatePriority }).updatePriority = updatePriority;
    view.rmaService.list.mockReturnValue(of(buildRmaPage([updated], 0, 20, 1)));
    view.open();
    const listCalls = view.rmaService.list.mock.calls.length;
    view.detail().querySelector<HTMLButtonElement>('app-rma-priority-field .custom-select__trigger')!.click();
    view.render();
    [...view.page.querySelectorAll<HTMLButtonElement>('app-rma-priority-field .custom-select__option')].find((option) => option.textContent?.includes('Alta'))!.click();
    view.render();
    expect(updatePriority).toHaveBeenCalledWith(5, 'HIGH');
    const field = view.detail().querySelector('app-rma-priority-field')!;
    expect(field.querySelector('.custom-select__trigger')?.getAttribute('data-priority')).toBe('HIGH');
    expect(field.querySelector('[role="status"]')?.textContent?.trim()).toBe('Prioridade alterada para Alta');
    expect(view.rmaService.list.mock.calls.length).toBeGreaterThan(listCalls);
    expect(view.page.querySelector('.modal-panel--narrow')).toBeNull();
  });
});
