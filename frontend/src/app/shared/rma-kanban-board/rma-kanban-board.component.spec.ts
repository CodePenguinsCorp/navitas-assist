import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaResponse, RmaSlaResponse, WarrantyStatus } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { RmaKanbanBoardComponent } from './rma-kanban-board.component';

describe('RmaKanbanBoardComponent card', () => {
  let fixture: ComponentFixture<RmaKanbanBoardComponent>;
  let now = signal(Date.parse('2026-10-20T12:00:00Z'));

  beforeEach(async () => {
    now = signal(Date.parse('2026-10-20T12:00:00Z'));
    await TestBed.configureTestingModule({
      imports: [RmaKanbanBoardComponent],
      providers: [{ provide: SlaClockService, useValue: { now } }],
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

  it('hides SLA when the state is NORMAL and when it is CLOSED', () => {
    const host = render([
      buildRma({ id: 1, code: 'NAV-0001' }),
      buildRma({ id: 2, code: 'NAV-0002', status: 'COMPLETED', sla: closedSla() }),
    ]);
    expect(card(host, 'NAV-0001').querySelector('app-rma-sla-badge')).toBeNull();
    expect(card(host, 'NAV-0002').querySelector('app-rma-sla-badge')).toBeNull();
  });

  it('shows SLA when the state is WARNING or OVERDUE', () => {
    now.set(Date.parse('2026-10-20T12:45:00Z'));
    let host = render([buildRma({})]);
    expect(card(host, 'NAV-0100').querySelector('app-rma-sla-badge')).not.toBeNull();

    now.set(Date.parse('2026-10-20T13:30:00Z'));
    fixture.detectChanges();
    host = fixture.nativeElement;
    expect(card(host, 'NAV-0100').querySelector('app-rma-sla-badge')).not.toBeNull();
  });

  it('moves the card SLA from hidden (NORMAL) to WARNING and then OVERDUE as the shared clock advances', () => {
    const host = render([buildRma({})]);
    const badge = () => card(host, 'NAV-0100').querySelector('app-rma-sla-badge [data-sla]');
    expect(card(host, 'NAV-0100').querySelector('app-rma-sla-badge')).toBeNull();

    now.set(Date.parse('2026-10-20T12:45:00Z'));
    fixture.detectChanges();
    expect(badge()?.getAttribute('data-sla')).toBe('WARNING');

    now.set(Date.parse('2026-10-20T13:30:00Z'));
    fixture.detectChanges();
    expect(badge()?.getAttribute('data-sla')).toBe('OVERDUE');
  });

  it('opens the card detail with Enter', () => {
    const rma = buildRma({});
    const host = render([rma]);
    const opened: RmaResponse[] = [];
    fixture.componentInstance.cardSelect.subscribe((item) => opened.push(item));
    card(host, 'NAV-0100').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(opened).toEqual([rma]);
  });

  it('does not open the card detail when Enter or Space is pressed on the bulk checkbox', () => {
    const rma = buildRma({});
    const host = render([rma], { bulkSelectionEnabled: true });
    const opened: RmaResponse[] = [];
    fixture.componentInstance.cardSelect.subscribe((item) => opened.push(item));
    const checkbox = host.querySelector<HTMLInputElement>('.board-card input[type="checkbox"]')!;
    for (const key of ['Enter', ' ']) {
      checkbox.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      checkbox.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    }
    expect(opened).toEqual([]);
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

  it('does not open the card when the bulk checkbox is clicked', () => {
    const rma = buildRma({});
    let host = render([rma]);
    expect(host.querySelector('.board-card input[type="checkbox"]')).toBeNull();

    host = render([rma], { bulkSelectionEnabled: true });
    const opened: RmaResponse[] = [];
    const toggled: RmaResponse[] = [];
    fixture.componentInstance.cardSelect.subscribe((item) => opened.push(item));
    fixture.componentInstance.bulkSelectionChange.subscribe((item) => toggled.push(item));
    host.querySelector<HTMLInputElement>('.board-card input[type="checkbox"]')!.click();
    expect(toggled).toEqual([rma]);
    expect(opened).toEqual([]);

    card(host, 'NAV-0100').click();
    expect(opened).toEqual([rma]);
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

function openSla(): RmaSlaResponse {
  return {
    status: 'NORMAL',
    startedAt: '2026-10-20T11:00:00Z',
    warningAt: '2026-10-20T12:30:00Z',
    dueAt: '2026-10-20T13:00:00Z',
    elapsedSeconds: 0,
    limitSeconds: 7200,
  };
}

function closedSla(): RmaSlaResponse {
  return {
    status: 'CLOSED',
    startedAt: '2026-10-20T11:00:00Z',
    warningAt: null,
    dueAt: null,
    elapsedSeconds: 3600,
    limitSeconds: null,
  };
}

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
    sla: openSla(), dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null, daysUntilDue: null }, stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T12:00:00Z', leftAt: null, durationSeconds: 0 }], dueDateHistory: [],
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-20T02:30:00Z',
  };
  return { ...base, ...values };
}
