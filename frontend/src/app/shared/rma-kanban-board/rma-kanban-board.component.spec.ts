import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaBoardCardResponse, RmaResponse, WarrantyStatus } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { toBoardCard } from '../../core/utils/rma-ui';
import { RmaKanbanBoardComponent } from './rma-kanban-board.component';

describe('RmaKanbanBoardComponent card', () => {
  let fixture: ComponentFixture<RmaKanbanBoardComponent>;
  let now = signal(Date.parse('2026-10-20T12:00:00Z'));

  beforeEach(async () => {
    now = signal(Date.parse('2026-10-20T12:00:00Z'));
    await TestBed.configureTestingModule({
      imports: [RmaKanbanBoardComponent],
      providers: [{ provide: ClockService, useValue: { now } }],
    }).compileComponents();
    fixture = TestBed.createComponent(RmaKanbanBoardComponent);
  });

  function render(rmas: RmaResponse[], inputs: Record<string, unknown> = {}): HTMLElement {
    return renderCards(rmas.map(toBoardCard), inputs);
  }

  function renderCards(cards: RmaBoardCardResponse[], inputs: Record<string, unknown> = {}): HTMLElement {
    fixture.componentRef.setInput('rmas', cards);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function card(host: HTMLElement, code: string): HTMLElement {
    const found = [...host.querySelectorAll<HTMLElement>('.board-card')].find((item) => item.textContent?.includes(code));
    expect(found, code).toBeDefined();
    return found!;
  }

  it('preserva a ordem recebida em vez de reordenar por prioridade', () => {
    const host = render([buildRma({ id: 1, code: 'PRIMEIRO', priority: 'LOW' }), buildRma({ id: 2, code: 'SEGUNDO', priority: 'HIGH' })]);
    expect([...host.querySelectorAll('.board-card h4')].map(c => c.textContent?.trim())).toEqual(['PRIMEIRO', 'SEGUNDO']);
  });

  it('oferece Alt+Setas com a mesma permissão do arraste', () => {
    const moved = vi.fn();
    (fixture.componentInstance as any).cardReorder.subscribe(moved);
    const host = render([buildRma({})], { canUpdateStatus: true });
    card(host, 'NAV-0100').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
    expect(moved).toHaveBeenCalledWith(expect.objectContaining({ direction: 1 }));
    render([buildRma({})], { canUpdateStatus: false });
    moved.mockClear();
    card(host, 'NAV-0100').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    expect(moved).not.toHaveBeenCalled();
  });

  it('mostra a linha de inserção e envia o sucessor indicado pelo arraste', () => {
    const dropped = vi.fn();
    fixture.componentInstance.columnDrop.subscribe(dropped);
    const host = render([buildRma({ id: 1, code: 'A', status: 'RECEIVED' }), buildRma({ id: 2, code: 'B', status: 'RECEIVED' })],
      { canUpdateStatus: true, draggedRmaId: 1, dragTargetStatus: 'RECEIVED' });
    vi.spyOn(card(host, 'B'), 'getBoundingClientRect').mockReturnValue({ top: 100, height: 100 } as DOMRect);
    const column = host.querySelector<HTMLElement>('[data-status="RECEIVED"]')!;
    column.dispatchEvent(new MouseEvent('dragover', { clientY: 120, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(card(host, 'B').previousElementSibling?.classList.contains('board-insertion')).toBe(true);
    column.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(dropped).toHaveBeenCalledWith(expect.objectContaining({ status: 'RECEIVED', beforeId: 2 }));
  });

  it.each([{ rmas: [] }, { rmas: [buildRma({})] }])('renders only an empty busy container while loading instead of previous cards or column empties ($rmas.length)', ({ rmas }) => {
    const host = render(rmas, { loading: true });
    const busy = host.querySelector('[aria-busy="true"]');
    expect(busy?.textContent?.trim()).toBe('');
    expect(busy?.children.length).toBe(0);
    expect(host.querySelector('.board-grid, .board-card, .board-empty-note, [role="status"]')).toBeNull();
    expect(host.textContent).not.toContain('Carregando');
    render([], { loading: false });
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    expect(host.querySelector('.board-grid')).not.toBeNull();
  });

  it('does not render the reported failure in the card', () => {
    const host = render([buildRma({ reportedFailure: 'Não liga após queda de energia' })]);
    expect(host.querySelector('.board-card__failure')).toBeNull();
    expect(card(host, 'NAV-0100').textContent).not.toContain('Não liga após queda de energia');
  });

  function due(dueDate: string | null, overrides: Partial<RmaResponse> = {}): Partial<RmaResponse> {
    const [y, m, d] = (dueDate ?? '2026-01-01').split('-').map(Number);
    const dueSoonFrom = new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
    return { dueDate, deadline: { status: dueDate ? 'ON_TRACK' : 'NO_DUE_DATE', dueSoonFrom: dueDate ? dueSoonFrom : null }, ...overrides };
  }

  it('mostra prazo em dia e omite sem data e encerradas', () => {
    const host = render([
      buildRma({ id: 1, code: 'NAV-0001', ...due('2026-12-30') }),
      buildRma({ id: 2, code: 'NAV-0002', ...due(null) }),
      buildRma({ id: 3, code: 'NAV-0003', status: 'COMPLETED', ...due('2026-10-01') }),
    ]);
    expect(card(host, 'NAV-0001').querySelector('.deadline-chip')?.textContent?.trim()).toBe('Prazo 30/12');
    for (const code of ['NAV-0002', 'NAV-0003']) {
      expect(card(host, code).querySelector('.deadline-chip')).toBeNull();
    }
  });

  it('shows Atrasado and Perto do limite on the card', () => {
    const host = render([
      buildRma({ id: 1, code: 'NAV-0001', ...due('2026-10-18') }),
      buildRma({ id: 2, code: 'NAV-0002', ...due('2026-10-23') }),
    ]);
    const late = card(host, 'NAV-0001').querySelector('.deadline-chip');
    expect(late?.textContent?.trim()).toBe('Atrasado há 2 dias (18/10)');
    expect(late?.getAttribute('data-deadline')).toBe('OVERDUE');
    const soon = card(host, 'NAV-0002').querySelector('.deadline-chip');
    expect(soon?.textContent?.trim()).toBe('Vence em 3 dias (23/10)');
    expect(soon?.getAttribute('data-deadline')).toBe('DUE_SOON');
    for (const code of ['NAV-0001', 'NAV-0002']) {
      const element = card(host, code);
      expect(element.querySelector('.deadline-chip app-icon svg')).not.toBeNull();
      const children = [...element.children];
      const title = children.findIndex(child => child.matches('.board-card__title'));
      expect(children[title + 1].querySelector('.deadline-chip')).not.toBeNull();
      expect(children[title + 2].matches('.board-card__stage')).toBe(true);
    }
  });

  it('turns the card overdue at São Paulo midnight as the shared clock advances', () => {
    now.set(Date.parse('2026-10-21T02:59:00Z'));
    const host = render([buildRma(due('2026-10-20'))]);
    const chip = () => card(host, 'NAV-0100').querySelector('.deadline-chip');
    expect(chip()?.textContent?.trim()).toBe('Vence hoje (20/10)');

    now.set(Date.parse('2026-10-21T03:01:00Z'));
    fixture.detectChanges();
    expect(chip()?.textContent?.trim()).toBe('Atrasado há 1 dia (20/10)');
    expect(chip()?.getAttribute('data-deadline')).toBe('OVERDUE');
  });

  it('shows the time in the current stage only for open ordens de serviço', () => {
    const host = render([
      buildRma({ id: 1, code: 'NAV-0001' }),
      buildRma({ id: 2, code: 'NAV-0002', status: 'COMPLETED', stagePeriods: [{ status: 'COMPLETED', enteredAt: '2026-10-19T12:00:00Z', leftAt: null, durationSeconds: 0 }] }),
    ]);
    expect(card(host, 'NAV-0001').querySelector('.board-card__stage')?.textContent?.trim()).toBe('há 1 h nesta etapa');
    expect(card(host, 'NAV-0002').querySelector('.board-card__stage')).toBeNull();
  });

  it('opens the card detail with Enter', () => {
    const rma = buildRma({});
    const host = render([rma]);
    const opened: RmaBoardCardResponse[] = [];
    fixture.componentInstance.cardSelect.subscribe((item) => opened.push(item));
    card(host, 'NAV-0100').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(opened).toEqual([toBoardCard(rma)]);
  });

  it('keeps code, client, product, priority label, avatar and active block', () => {
    const host = render([
      buildRma({
        currentBlock: {
          id: 3,
          reason: 'Peça pendente',
          category: null,
          blockedBy: 'Atendimento',
          blockedAt: '2026-10-20T10:00:00Z',
          resolvedBy: null,
          resolvedAt: null,
          resolutionNote: null,
        },
      }),
    ]);
    const element = card(host, 'NAV-0100');
    expect(element.querySelector('.board-card__identity')?.textContent).toContain('NAV-0100');
    expect(element.querySelector('.board-card__client')?.textContent).toContain('Árvore Equipamentos');
    expect(element.querySelector('.board-card__title')?.textContent).toContain('Controlador Premium');
    expect(element.querySelector('.priority-tag')?.textContent?.trim()).toBe('Alta');
    const avatar = element.querySelector('.board-card__avatar');
    expect(avatar?.getAttribute('aria-label')).toBe('Responsável: Técnico Responsável');
    expect(avatar?.textContent?.trim()).toBe('TR');
    expect(element.querySelector('.board-card__block')?.textContent).toContain('Impedida há 2 h');
  });

  it('renders everything from the minimal board card: product summary, deadline, stage time and impediment', () => {
    const minimal: RmaBoardCardResponse = {
      id: 7, code: 'NAV-0007', clientName: 'Cliente Mínimo', productName: 'Produto A', additionalItems: 2, searchText: 'SKU-A',
      warranty: 'P', status: 'IN_REPAIR', priority: 'MEDIUM', entryDate: '2026-10-10',
      dueDate: '2026-10-19', dueSoonFrom: '2026-10-12', updatedAt: '2026-10-20T10:00:00Z', assigneeId: null, assigneeName: null,
      blockedAt: '2026-10-20T10:00:00Z', currentStageEnteredAt: '2026-10-18T08:00:00Z',
    };
    const element = card(renderCards([minimal]), 'NAV-0007');
    expect(element.querySelector('.board-card__title')?.textContent).toContain('Produto A + 2 item(ns)');
    expect(element.querySelector('.deadline-chip')?.getAttribute('data-deadline')).toBe('OVERDUE');
    expect(element.querySelector('.board-card__stage')?.textContent?.trim()).toBe('há 2 d 4 h nesta etapa');
    expect(element.querySelector('.board-card__block')?.textContent).toContain('Impedida há 2 h');
  });

  it('has no selection checkbox on the card', () => {
    const host = render([buildRma({})]);
    expect(host.querySelector('.board-card input[type="checkbox"]')).toBeNull();
    expect(host.querySelector('.board-card__selection')).toBeNull();
  });

  it('renders a card without assignee, failure or with a very long client name without throwing', () => {
    const longClient = 'Distribuidora '.repeat(20).trim();
    const host = render([
      buildRma({ assigneeId: null, assigneeName: null, reportedFailure: '', clientName: longClient }),
    ]);
    const element = card(host, 'NAV-0100');
    const client = element.querySelector('.board-card__client');
    expect(client?.textContent?.trim()).toBe(longClient);
    Object.defineProperty(client!, 'scrollWidth', { configurable: true, value: 400 }); Object.defineProperty(client!, 'clientWidth', { configurable: true, value: 100 });
    client!.dispatchEvent(new Event('mouseenter'));
    expect(document.querySelector('.app-tip')?.textContent).toBe(longClient);
    const avatar = element.querySelector('.board-card__avatar');
    expect(avatar?.getAttribute('aria-label')).toBe('Responsável: Sem responsável');
    expect(avatar?.classList.contains('is-empty')).toBe(true);
  });
});

function buildRma(values: Partial<RmaResponse>): RmaResponse {
  const base: RmaResponse = {
    id: 100,
    code: 'NAV-0100',
    clientName: 'Árvore Equipamentos',
    items: [
      {
        id: 1,
        productName: 'Controlador Premium',
        productSku: 'CTRL-01',
        batchNumber: 'LOTE-ALFA',
        serialNumber: 'SERIE-ALFA',
        manufacturedAt: '2026-01-01',
        warrantyMonths: 12,
        warrantyExpiresAt: '2027-01-01',
        calculatedWarrantyStatus: WarrantyStatus.IN_WARRANTY, warrantyOverride: null, warrantyStatus: WarrantyStatus.IN_WARRANTY,
      },
    ],
    purchaseDate: '2026-02-01',
    purchaseDateUnknown: false,
    entryDate: '2026-10-10',
    invoiceNumber: null,
    receivedBy: 'Atendimento',
    reportedFailure: 'Falha informada',
    receivedAccessories: null,
    physicalCondition: null,
    priority: 'HIGH',
    status: 'TRIAGE',
    assigneeId: 7,
    assigneeName: 'Técnico Responsável',
    diagnosis: null,
    repairHistory: [], statusHistory: [],
    assignmentHistory: [],
    currentBlock: null,
    blockHistory: [],
    dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null }, stagePeriods: [{ status: 'TRIAGE', enteredAt: '2026-10-20T11:00:00Z', leftAt: null, durationSeconds: 0 }], dueDateHistory: [], warrantyHistory: [],
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-20T02:30:00Z',
  };
  return { ...base, ...values };
}
