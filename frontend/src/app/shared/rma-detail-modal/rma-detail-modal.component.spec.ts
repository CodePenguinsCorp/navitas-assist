import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { DiagnosisResponse, RmaResponse, WarrantyStatus } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { buildRma, buildRmaItem } from '../../testing/rma-fixtures';
import { RmaDetailModalComponent } from './rma-detail-modal.component';

@Component({ template: '' })
class StubComponent {}

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
  items: [
    buildRmaItem({ id: 1, productName: 'Produto A', productSku: 'SKU-A', serialNumber: 'S1', batchNumber: 'L1', warrantyMonths: 12, warrantyExpiresAt: '2027-02-01', warrantyStatus: WarrantyStatus.IN_WARRANTY }),
    buildRmaItem({ id: 2, productName: 'Produto B', productSku: 'SKU-B', serialNumber: null, batchNumber: 'L2', warrantyMonths: 1, warrantyExpiresAt: null })
  ],
  status: 'TRIAGE',
  priority: 'HIGH',
  purchaseDate: null,
  purchaseDateUnknown: true,
  invoiceNumber: null,
  receivedAccessories: 'Fonte original',
  physicalCondition: 'Riscado',
  diagnosis,
  repairSummary: 'Troca do capacitor',
  replacedPartsSummary: 'Capacitor C12',
  testSummary: 'Bancada 2h',
  currentBlock: {
    id: 3, reason: 'Aguardando cliente', category: null, blockedBy: 'ana', blockedAt: '2026-10-20T10:00:00Z',
    resolvedBy: null, resolvedAt: null, resolutionNote: null
  },
  statusHistory: [
    { status: 'TRIAGE', changedBy: 'ana', changedAt: '2026-10-20T10:00:00Z', note: null },
    { status: 'TRIAGE', changedBy: 'ana', changedAt: '2026-10-20T11:00:00Z', note: 'Prioridade alterada para Alta' }
  ],
  assignmentHistory: [
    { previousAssigneeId: null, previousAssigneeName: null, newAssigneeId: 7, newAssigneeName: 'Ana', changedBy: 'bia', changedAt: '2026-10-20T10:30:00Z' }
  ]
});

async function setup(inputs: { rma?: RmaResponse; canUpdateStatus?: boolean; canUpdateAssignee?: boolean; disabled?: boolean } = {}) {
  await TestBed.configureTestingModule({
    imports: [RmaDetailModalComponent],
    providers: [
      provideRouter([{ path: 'rmas', component: StubComponent }]),
      { provide: SlaClockService, useValue: { now: signal(NOW) } }
    ]
  }).compileComponents();
  const fixture: ComponentFixture<RmaDetailModalComponent> = TestBed.createComponent(RmaDetailModalComponent);
  fixture.componentRef.setInput('rma', inputs.rma ?? fullRma);
  fixture.componentRef.setInput('canUpdateStatus', inputs.canUpdateStatus ?? true);
  fixture.componentRef.setInput('canUpdateAssignee', inputs.canUpdateAssignee ?? true);
  fixture.componentRef.setInput('disabled', inputs.disabled ?? false);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const component = fixture.componentInstance;
  /** Heading text without the count chip. */
  const headingText = (heading: Element) => {
    const clone = heading.cloneNode(true) as Element;
    clone.querySelectorAll('.mini-chip').forEach((chip) => chip.remove());
    return clone.textContent?.trim();
  };
  const section = (title: string) =>
    [...host.querySelectorAll<HTMLElement>('.rma-detail__section')].find((item) => headingText(item.querySelector('.rma-detail__heading')!) === title) ?? null;
  const tiles = (root: Element) =>
    [...root.querySelectorAll('.rma-detail__tile')].map((tile) => [tile.querySelector('span')?.textContent?.trim(), tile.querySelector('strong, em')?.textContent?.trim()]);
  const sidePairs = () =>
    Object.fromEntries([...host.querySelectorAll('.rma-detail__side dl > div')].map((row) => [row.querySelector('dt')?.textContent?.trim(), row.querySelector('dd')?.textContent?.trim()]));
  const buttonByText = (text: string) =>
    [...host.querySelectorAll<HTMLElement>('button, a')].find((element) => element.textContent?.trim() === text);

  return { fixture, host, component, headingText, section, tiles, sidePairs, buttonByText };
}

describe('RmaDetailModalComponent with the shared information contract', () => {
  it('shows the blocks in contract order with the shared names', async () => {
    // Hoje os títulos são "Itens", "Reparo" e "Atividade".
    const { host, headingText } = await setup();

    expect([...host.querySelectorAll('.rma-detail__heading')].map(headingText)).toEqual([
      'Falha relatada', 'Produtos', 'Recebimento', 'Diagnóstico', 'Reparo e testes', 'Histórico'
    ]);
  });

  it('shows warranty term and expiry for each product', async () => {
    // Hoje cada item mostra só "SKU · Série · Lote" e o estado, sem prazo nem vencimento.
    const { section } = await setup();
    expect(section('Produtos')).not.toBeNull();
    const items = [...section('Produtos')!.querySelectorAll('.rma-detail__items > li')];
    const facts = (item: Element) =>
      [...item.querySelectorAll('dl > div')].map((row) => [row.querySelector('dt')?.textContent?.trim(), row.querySelector('dd')?.textContent?.trim()]);

    expect(items).toHaveLength(2);
    expect(items[0].querySelector('strong')?.textContent?.trim()).toBe('Produto A');
    expect(items[0].querySelector('.mini-chip')?.textContent?.trim()).toBe('Em garantia');
    expect(facts(items[0])).toEqual([
      ['SKU', 'SKU-A'], ['Série', 'S1'], ['Lote', 'L1'], ['Prazo de garantia', '12 meses'], ['Vencimento', '01/02/2027']
    ]);
    expect(facts(items[1])).toEqual([
      ['SKU', 'SKU-B'], ['Série', 'Não informada'], ['Lote', 'L2'], ['Prazo de garantia', '1 mês'], ['Vencimento', 'Sem data da compra']
    ]);
  });

  it('lets each product fact and the name/warranty header shrink and wrap', async () => {
    // Hoje cada par do dl é uma linha flex sem redução e o dd não tem overflow-wrap; uma série de 60 caracteres extrapola.
    const serial = 'S'.repeat(60);
    const name = 'Produto com nome muito longo para a largura de um celular pequeno';
    const { section } = await setup({ rma: { ...fullRma, items: [buildRmaItem({ productName: name, serialNumber: serial })] } });
    const item = section('Produtos')!.querySelector<HTMLElement>('.rma-detail__items > li')!;
    const serialRow = [...item.querySelectorAll<HTMLElement>('dl > div')].find((row) => row.querySelector('dt')?.textContent?.trim() === 'Série')!;
    /** Declared min-inline-size in px; NaN when the rule is absent. */
    const minInline = (element: Element) => parseFloat(getComputedStyle(element).getPropertyValue('min-inline-size'));

    expect(serialRow.querySelector('dd')?.textContent?.trim()).toBe(serial);
    expect(minInline(serialRow)).toBe(0);
    expect(minInline(serialRow.querySelector('dd')!)).toBe(0);
    expect(getComputedStyle(serialRow.querySelector('dd')!).overflowWrap).toBe('anywhere');
    const title = item.querySelector<HTMLElement>(':scope > strong')!;
    expect(title.textContent?.trim()).toBe(name);
    expect(minInline(title)).toBe(0);
    expect(getComputedStyle(title).overflowWrap).toBe('anywhere');
  });

  it('shows diagnosis date and Notas, and an empty diagnosis state', async () => {
    // Hoje não há "Data do diagnóstico", as notas se chamam "Observações" e o bloco some sem diagnóstico.
    const { section, tiles } = await setup();
    expect(tiles(section('Diagnóstico')!)).toEqual([
      ['Falha encontrada', 'Capacitor estufado'], ['Tipo', 'Fonte'], ['Causa provável', 'Componente'],
      ['Data do diagnóstico', '21/10/2026'], ['Técnico', 'Bia'], ['Notas', 'Trocar lote']
    ]);
    expect(section('Diagnóstico')!.textContent).not.toContain('Observações');

    TestBed.resetTestingModule();
    const empty = await setup({ rma: { ...fullRma, diagnosis: null } });
    const block = empty.section('Diagnóstico');
    expect(block).not.toBeNull();
    expect(block!.querySelector('.rma-detail__muted')?.textContent?.trim()).toBe('Sem diagnóstico registrado.');
    expect(block!.querySelector('button, a')).toBeNull();
  });

  it('uses the creation labels for retroactive repair records', async () => {
    // Hoje os rótulos são "Resumo do reparo" e "Peças substituídas".
    const { section, tiles, host } = await setup();

    expect(section('Reparo e testes')).not.toBeNull();
    expect(tiles(section('Reparo e testes')!)).toEqual([
      ['Reparo', 'Troca do capacitor'], ['Peças trocadas', 'Capacitor C12'], ['Testes', 'Bancada 2h']
    ]);
    expect(host.textContent).not.toContain('Resumo do reparo');
    expect(host.textContent).not.toContain('Peças substituídas');
  });

  it('labels status records without inferring a move', async () => {
    // Hoje cada registro de status aparece como "Moveu para <status>".
    const { section } = await setup();
    const history = section('Histórico')!;
    expect(history).not.toBeNull();
    const statusEvents = [...history.querySelectorAll('li.rma-detail__event:not(.is-assignee)')];

    expect(statusEvents).toHaveLength(2);
    expect(statusEvents.map((event) => event.querySelector('p')?.textContent?.trim())).toEqual([
      'Status registrado: Triagem', 'Status registrado: Triagem'
    ]);
    expect(statusEvents[0].querySelector('blockquote')?.textContent?.trim()).toBe('Prioridade alterada para Alta');
    expect(history.textContent).not.toContain('Moveu para');
  });

  it('uses Sem responsável in assignee history', async () => {
    // Hoje a origem nula aparece como "ninguém".
    const { host } = await setup();
    const event = host.querySelector('li.rma-detail__event.is-assignee')!;

    expect(event.textContent).toContain('Sem responsável');
    expect(event.textContent).toContain('Ana');
    expect(event.textContent).not.toContain('ninguém');
  });

  it('formats status, priority, invoice and purchase like the list', async () => {
    // Hoje: span.rma-detail__status, prioridade em .mini-chip, nota "—" e compra desconhecida "Não informada".
    const { host, sidePairs } = await setup();
    const side = host.querySelector('.rma-detail__side')!;

    expect(side.querySelector('.status-chip[data-status="TRIAGE"]')?.textContent?.trim()).toBe('Triagem');
    expect(side.querySelector('.rma-detail__status')).toBeNull();
    expect(side.querySelector('.priority-tag[data-priority="HIGH"] .priority-bars')).not.toBeNull();
    expect(side.querySelector('.priority-tag')?.textContent?.trim()).toBe('Alta');
    const pairs = sidePairs();
    expect(pairs['Nota fiscal']).toBe('Não informada');
    expect(pairs['Compra']).toBe('Desconhecida');
    expect(pairs).not.toHaveProperty('Data da compra');
    expect(pairs['Recebido por']).toBe('tester');
    expect(pairs).toHaveProperty('Criado em');
    expect(pairs).toHaveProperty('Atualizado em');
  });

  it('navigates to the RMA in the list', async () => {
    // Hoje o link "Abrir RMA na lista" não existe.
    const { fixture, buttonByText } = await setup();
    const link = buttonByText('Abrir RMA na lista');

    expect(link?.tagName).toBe('A');
    link!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/rmas?rma=5');
  });

  it('keeps the list link inactive while disabled', async () => {
    // Hoje o link não existe; durante disabled() ele deve ser um botão inativo, sem href.
    const { fixture, host, buttonByText } = await setup({ disabled: true });
    const control = buttonByText('Abrir RMA na lista');

    expect(control?.tagName).toBe('BUTTON');
    expect((control as HTMLButtonElement).disabled).toBe(true);
    expect(host.querySelector('.rma-detail__actions a[href]')).toBeNull();
    control!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/');
  });

  // Preservação
  it('has no tabs', async () => {
    const { host } = await setup();
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(host.querySelector('[role="tab"]')).toBeNull();
  });

  it.each([
    [true, true],
    [true, false],
    [false, false]
  ])('shows status and assignee actions only when allowed and always Ver impedimentos (status %s, assignee %s)', async (canUpdateStatus, canUpdateAssignee) => {
    const { buttonByText, host } = await setup({ canUpdateStatus, canUpdateAssignee, rma: { ...fullRma, assigneeId: null } });

    expect(buttonByText('Alterar status') !== undefined).toBe(canUpdateStatus);
    expect(buttonByText('Atribuir') !== undefined).toBe(canUpdateAssignee);
    expect(buttonByText('Ver impedimentos')).toBeDefined();
    expect(host.querySelector('.modal-close')).not.toBeNull();
  });

  it('disables business actions while disabled', async () => {
    const { buttonByText, host } = await setup({ disabled: true, rma: { ...fullRma, assigneeId: 7, assigneeName: 'Ana' } });

    for (const label of ['Alterar status', 'Trocar responsável', 'Ver impedimentos']) {
      expect((buttonByText(label) as HTMLButtonElement).disabled, label).toBe(true);
    }
    expect(host.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(false);
  });

  it('emits closed, statusChange, assigneeChange and blockInspect', async () => {
    const rma = { ...fullRma, assigneeId: 7, assigneeName: 'Ana' };
    const { component, buttonByText, host } = await setup({ rma });
    const closed = vi.fn();
    const statusChange = vi.fn();
    const assigneeChange = vi.fn();
    const blockInspect = vi.fn();
    component.closed.subscribe(closed);
    component.statusChange.subscribe(statusChange);
    component.assigneeChange.subscribe(assigneeChange);
    component.blockInspect.subscribe(blockInspect);

    buttonByText('Alterar status')!.click();
    buttonByText('Trocar responsável')!.click();
    buttonByText('Ver impedimentos')!.click();
    host.querySelector<HTMLButtonElement>('.modal-close')!.click();
    host.querySelector<HTMLElement>('.modal-overlay')!.click();

    expect(statusChange).toHaveBeenCalledWith(rma);
    expect(assigneeChange).toHaveBeenCalledWith(rma);
    expect(blockInspect).toHaveBeenCalledWith(rma);
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('shows the active block and the SLA badge', async () => {
    const { host } = await setup();
    const block = host.querySelector('.rma-detail__block')!;

    expect(block.querySelector('strong')?.textContent?.trim()).toBe('Bloqueado há 2h 0min');
    expect(block.textContent).toContain('Aguardando cliente');
    expect(host.querySelector('.rma-detail__side app-rma-sla-badge')).not.toBeNull();
  });

  it('focuses the panel on open', async () => {
    const { fixture, host } = await setup();
    await fixture.whenStable();

    expect(document.activeElement).toBe(host.querySelector('.rma-detail'));
  });
});
