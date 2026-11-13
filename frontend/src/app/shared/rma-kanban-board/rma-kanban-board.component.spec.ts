import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaResponse, WarrantyStatus } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
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
    fixture.componentRef.setInput('rmas', rmas);
    fixture.componentRef.setInput('showToolbar', false);
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
    return { dueDate, deadline: { status: dueDate ? 'ON_TRACK' : 'NO_DUE_DATE', dueSoonFrom: dueDate ? dueSoonFrom : null, daysUntilDue: null }, ...overrides };
  }

  it('hides the deadline when on track, without due date and when closed', () => {
    const host = render([
      buildRma({ id: 1, code: 'NAV-0001', ...due('2026-12-30') }),
      buildRma({ id: 2, code: 'NAV-0002', ...due(null) }),
      buildRma({ id: 3, code: 'NAV-0003', status: 'COMPLETED', ...due('2026-10-01') }),
    ]);
    for (const code of ['NAV-0001', 'NAV-0002', 'NAV-0003']) {
      expect(card(host, code).querySelector('.deadline-chip')).toBeNull();
    }
  });

  it('shows Atrasado and Perto do limite on the card', () => {
    const host = render([
      buildRma({ id: 1, code: 'NAV-0001', ...due('2026-10-18') }),
      buildRma({ id: 2, code: 'NAV-0002', ...due('2026-10-23') }),
    ]);
    const late = card(host, 'NAV-0001').querySelector('.deadline-chip');
    expect(late?.textContent?.trim()).toBe('Atrasado há 2 dias');
    expect(late?.getAttribute('data-deadline')).toBe('OVERDUE');
    const soon = card(host, 'NAV-0002').querySelector('.deadline-chip');
    expect(soon?.textContent?.trim()).toBe('Vence em 3 dias');
    expect(soon?.getAttribute('data-deadline')).toBe('DUE_SOON');
  });

  it('turns the card overdue at São Paulo midnight as the shared clock advances', () => {
    now.set(Date.parse('2026-10-21T02:59:00Z'));
    const host = render([buildRma(due('2026-10-20'))]);
    const chip = () => card(host, 'NAV-0100').querySelector('.deadline-chip');
    expect(chip()?.textContent?.trim()).toBe('Vence hoje');

    now.set(Date.parse('2026-10-21T03:01:00Z'));
    fixture.detectChanges();
    expect(chip()?.textContent?.trim()).toBe('Atrasado há 1 dia');
    expect(chip()?.getAttribute('data-deadline')).toBe('OVERDUE');
  });

  it('shows the time in the current stage only for open RMAs', () => {
    const host = render([
      buildRma({ id: 1, code: 'NAV-0001' }),
      buildRma({ id: 2, code: 'NAV-0002', status: 'COMPLETED', stagePeriods: [{ status: 'COMPLETED', enteredAt: '2026-10-19T12:00:00Z', leftAt: null, durationSeconds: 0 }] }),
    ]);
    expect(card(host, 'NAV-0001').querySelector('.board-card__stage')?.textContent?.trim()).toBe('há 1 h nesta etapa');
    expect(card(host, 'NAV-0002').querySelector('.board-card__stage')).toBeNull();
    expect(host.textContent).not.toContain('SLA');
  });

  it('opens the card detail with Enter', () => {
    const rma = buildRma({});
    const host = render([rma]);
    const opened: RmaResponse[] = [];
    fixture.componentInstance.cardSelect.subscribe((item) => opened.push(item));
    card(host, 'NAV-0100').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(opened).toEqual([rma]);
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
    expect(element.querySelector('.board-card__block')?.textContent).toContain('Bloqueado há 2 h');
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
    expect(client?.getAttribute('title')).toBe(longClient);
    const avatar = element.querySelector('.board-card__avatar');
    expect(avatar?.getAttribute('aria-label')).toBe('Responsável: Sem responsável');
    expect(avatar?.classList.contains('is-empty')).toBe(true);
  });
});

function buildRma(values: Partial<RmaResponse>): RmaResponse {
  const base: RmaResponse = {
    id: 100,
    code: 'NAV-0100',
    clientId: 1,
    clientName: 'Árvore Equipamentos',
    items: [
      {
        id: 1,
        productId: 1,
        productName: 'Controlador Premium',
        productSku: 'CTRL-01',
        batchNumber: 'LOTE-ALFA',
        serialNumber: 'SERIE-ALFA',
        manufacturedAt: '2026-01-01',
        warrantyMonths: 12,
        warrantyExpiresAt: '2027-01-01',
        warrantyStatus: WarrantyStatus.IN_WARRANTY,
      },
    ],
    productId: 1,
    productName: 'Controlador Premium',
    productSku: 'CTRL-01',
    batchNumber: 'LOTE-ALFA',
    serialNumber: 'SERIE-ALFA',
    manufacturedAt: '2026-01-01',
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
    repairSummary: null,
    replacedPartsSummary: null,
    testSummary: null,
    shippedAt: null,
    carrier: null,
    trackingCode: null,
    diagnosis: null,
    statusHistory: [],
    assignmentHistory: [],
    currentBlock: null,
    blockHistory: [],
    dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null, daysUntilDue: null }, stagePeriods: [{ status: 'TRIAGE', enteredAt: '2026-10-20T11:00:00Z', leftAt: null, durationSeconds: 0 }], dueDateHistory: [],
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-20T02:30:00Z',
  };
  return { ...base, ...values };
}
