import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { DiagnosisResponse, RmaResponse, WarrantyStatus } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { AuthService } from '../../core/services/auth.service';
import { RmaService } from '../../core/services/rma.service';
import { of } from 'rxjs';
import { buildRma, buildRmaItem } from '../../testing/rma-fixtures';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';
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

const USERS = [
  { id: 7, username: 'ana', fullName: 'Ana Lima' },
  { id: 8, username: 'bruno', fullName: 'Bruno Costa' },
  { id: 9, username: 'bia', fullName: 'Beatriz Souza' }
];

async function setup(inputs: { rma?: RmaResponse; canUpdateStatus?: boolean; canUpdateAssignee?: boolean; canEditDueDate?: boolean; disabled?: boolean } = {}) {
  await TestBed.configureTestingModule({
    imports: [RmaDetailModalComponent],
    providers: [
      provideRouter([{ path: 'rmas', component: StubComponent }]),
      { provide: AuthService, useValue: { currentUser: () => ({ name: 'Ana' }) } },
      { provide: ClockService, useValue: { now: signal(NOW) } },
      providePermissions(profilePermissions('ADMIN')),
      { provide: RmaService, useValue: {
        updateStatus: (id: number, payload: { status: RmaResponse['status'] }) => of({ ...(inputs.rma ?? fullRma), id, status: payload.status }),
        updateDueDate: (id: number, dueDate: string | null) => of({ ...(inputs.rma ?? fullRma), id, dueDate }),
        updatePriority: (id: number, priority: RmaResponse['priority']) => of({ ...(inputs.rma ?? fullRma), id, priority }),
        resolveBlock: (id: number, blockId: number, body: { resolutionNote: string }) => of({
          ...(inputs.rma ?? fullRma), id, currentBlock: null,
          blockHistory: [{ ...(inputs.rma ?? fullRma).currentBlock!, id: blockId, resolvedBy: 'ana', resolvedAt: '2026-10-20T11:50:00Z', resolutionNote: body.resolutionNote }]
        })
      } }
    ]
  }).compileComponents();
  const fixture: ComponentFixture<RmaDetailModalComponent> = TestBed.createComponent(RmaDetailModalComponent);
  fixture.componentRef.setInput('rma', inputs.rma ?? fullRma);
  fixture.componentRef.setInput('canUpdateStatus', inputs.canUpdateStatus ?? true);
  fixture.componentRef.setInput('canUpdateAssignee', inputs.canUpdateAssignee ?? true);
  fixture.componentRef.setInput('canEditDueDate', inputs.canEditDueDate ?? false);
  fixture.componentRef.setInput('disabled', inputs.disabled ?? false);
  fixture.componentRef.setInput('assignableUsers', USERS);
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
    [...host.querySelectorAll<HTMLElement>('.rma-detail__section')].find((item) => headingText(item.querySelector('.rma-detail__heading, app-rma-diagnosis h3')!) === title) ?? null;
  const tiles = (root: Element) =>
    [...root.querySelectorAll('.rma-detail__tile, app-rma-diagnosis dl > div')].map((tile) => [tile.querySelector('span, dt')?.textContent?.trim(), tile.querySelector('strong, em, dd')?.textContent?.trim()]);
  const sidePairs = () =>
    Object.fromEntries([...host.querySelectorAll('.rma-detail__side dl > div')].map((row) => [row.querySelector('dt')?.textContent?.trim(), row.querySelector('dd')?.textContent?.trim()]));
  const buttonByText = (text: string) =>
    [...host.querySelectorAll<HTMLElement>('button, a')].find((element) => element.textContent?.trim() === text);

  return { fixture, host, component, headingText, section, tiles, sidePairs, buttonByText };
}

describe('RmaDetailModalComponent with the shared information contract', () => {
  it('edita o diagnóstico no mesmo cartão e cancela sem fechar o detalhe', async () => {
    const { fixture, host, section } = await setup();
    const card = section('Diagnóstico')!;
    card.querySelector<HTMLButtonElement>('.diagnosis-trigger')!.click();
    fixture.detectChanges(); TestBed.tick();
    expect(card.querySelector('[formControlName="foundFailure"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    card.querySelector<HTMLButtonElement>('.form-actions .button-secondary')!.click();
    fixture.detectChanges(); TestBed.tick();
    expect(card.querySelector('form')).toBeNull();
    expect(host.querySelector('.rma-detail')).not.toBeNull();
  });
  it('shows the blocks in contract order with the shared names', async () => {
    // Hoje os títulos são "Itens", "Reparo" e "Atividade".
    const { host, headingText } = await setup();

    expect([...host.querySelectorAll('.rma-detail__heading, app-rma-diagnosis h3')].map(headingText)).toEqual([
      'Falha relatada', 'Impedimentos', 'Produtos', 'Recebimento', 'Diagnóstico', 'Reparo e testes', 'Histórico'
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
    expect(block!.querySelector('.muted-inline')?.textContent?.trim()).toBe('Sem diagnóstico registrado.');
    expect(block!.querySelector('button.link-button')?.textContent?.trim()).toBe('Registrar diagnóstico');
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
    const { host, sidePairs } = await setup({ canUpdateStatus: false });
    const side = host.querySelector('.rma-detail__side')!;

    expect(host.querySelector('.rma-detail__actions .status-chip[data-status="TRIAGE"]')?.textContent?.trim()).toBe('Triagem');
    expect(side.querySelector('.status-chip')).toBeNull();
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

  it('navigates to the RMA in the list from a quiet text link beside the code', async () => {
    const { fixture, host, buttonByText } = await setup();
    const link = buttonByText('Abrir na lista');

    expect(link?.tagName).toBe('A');
    expect(link!.closest('.rma-detail__bar')).not.toBeNull();
    expect(link!.classList).toContain('rma-detail__open-link');
    expect(link!.className).not.toContain('button-');
    expect(link!.querySelector('app-icon')).not.toBeNull();
    expect(host.querySelector('.rma-detail__actions a')).toBeNull();
    link!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/rmas?rma=5');
  });

  it('keeps the list link inactive while disabled', async () => {
    const { fixture, host, buttonByText } = await setup({ disabled: true });
    const control = buttonByText('Abrir na lista');

    expect(control?.tagName).toBe('BUTTON');
    expect((control as HTMLButtonElement).disabled).toBe(true);
    expect(control!.className).not.toContain('button-');
    expect(host.querySelector('.rma-detail__bar a[href]')).toBeNull();
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
  ])('shows status and assignee actions only when allowed and always the Impedimentos card (status %s, assignee %s)', async (canUpdateStatus, canUpdateAssignee) => {
    const { buttonByText, host } = await setup({ canUpdateStatus, canUpdateAssignee, rma: { ...fullRma, assigneeId: null } });

    expect(host.querySelector('app-custom-select.rma-detail__status') !== null).toBe(canUpdateStatus);
    expect(host.querySelector('span.status-chip.rma-detail__status') !== null).toBe(!canUpdateStatus);
    expect(host.querySelector('.rma-detail__assignee-picker') !== null).toBe(canUpdateAssignee);
    expect(buttonByText('Atribuir')).toBeUndefined();
    expect(buttonByText('Trocar responsável')).toBeUndefined();
    expect(buttonByText('Ver impedimentos')).toBeUndefined();
    expect(host.querySelector('app-rma-blocks-section')).not.toBeNull();
    expect(host.querySelector('.modal-close')).not.toBeNull();
  });

  it('disables business actions while disabled', async () => {
    const { buttonByText, host } = await setup({ disabled: true, rma: { ...fullRma, assigneeId: 7, assigneeName: 'Ana' } });

    expect((buttonByText('Resolver') as HTMLButtonElement).disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('.rma-detail__assignee-picker .custom-select__trigger')!.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('.rma-detail__status .custom-select__trigger')!.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(true);
  });

  it('does not close from the button or the backdrop while a write is pending', async () => {
    const { component, host } = await setup({ disabled: true });
    const closed = vi.fn();
    component.closed.subscribe(closed);

    host.querySelector<HTMLButtonElement>('.modal-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    host.querySelector<HTMLElement>('.modal-overlay')!.click();

    expect(closed).not.toHaveBeenCalled();
  });

  it('emits closed from the close button and the backdrop, with no separate impediments button', async () => {
    const rma = { ...fullRma, assigneeId: 7, assigneeName: 'Ana' };
    const { component, buttonByText, host } = await setup({ rma });
    const closed = vi.fn();
    const statusChange = vi.fn();
    const assigneeChange = vi.fn();
    component.closed.subscribe(closed);
    component.rmaUpdated.subscribe(statusChange);
    component.assigneeChange.subscribe(assigneeChange);

    expect(buttonByText('Ver impedimentos')).toBeUndefined();
    expect('blockInspect' in component).toBe(false);
    host.querySelector<HTMLButtonElement>('.modal-close')!.click();
    host.querySelector<HTMLElement>('.modal-overlay')!.click();

    expect(statusChange).not.toHaveBeenCalled();
    expect(assigneeChange).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('shows the active block inside the Impedimentos card with an inline Resolver', async () => {
    const { host, section, buttonByText } = await setup();
    const card = section('Impedimentos')!;
    const current = card.querySelector('app-rma-blocks-section .blocks-section__current')!;

    expect(current.querySelector('strong')?.textContent?.trim()).toBe('Bloqueado há 2 h');
    expect(current.textContent).toContain('Aguardando cliente');
    expect(buttonByText('Resolver')?.classList).toContain('link-button');
    expect(host.querySelector('.rma-detail__block')).toBeNull();
    expect(host.querySelector('dialog, app-rma-block-panel')).toBeNull();
    expect(host.textContent).not.toContain('SLA');
  });

  it('shows Sem impedimento and Sinalizar impedimento when the RMA is not blocked', async () => {
    const { section } = await setup({ rma: { ...fullRma, currentBlock: null } });
    const card = section('Impedimentos')!;
    expect(card.querySelector('.blocks-section__empty')?.textContent?.trim()).toBe('Sem impedimento');
    expect([...card.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Sinalizar impedimento')).toBe(true);
  });

  it('emits rmaUpdated with the RMA saved by the inline resolve', async () => {
    const { fixture, component, buttonByText, section } = await setup();
    const updated: RmaResponse[] = [];
    component.rmaUpdated.subscribe((rma) => updated.push(rma));
    buttonByText('Resolver')!.click();
    fixture.detectChanges();
    const note = section('Impedimentos')!.querySelector<HTMLTextAreaElement>('textarea')!;
    note.value = 'Cliente respondeu';
    note.dispatchEvent(new Event('input'));
    note.closest('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(updated).toHaveLength(1);
    expect(updated[0].currentBlock).toBeNull();
    expect(section('Impedimentos')!.querySelector('.blocks-section__empty')?.textContent?.trim()).toBe('Sem impedimento');
  });

  it('disables the inline impediment actions while the detail is busy', async () => {
    const { buttonByText } = await setup({ disabled: true });
    expect((buttonByText('Resolver') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows Sem data limite when there is none', async () => {
    const { host, sidePairs } = await setup({ rma: { ...fullRma, dueDate: null } });
    expect(sidePairs()['Data limite']).toBe('Sem data limite');
    const row = [...host.querySelectorAll('.rma-detail__side dl > div')].find((item) => item.querySelector('dt')?.textContent?.trim() === 'Data limite')!;
    expect(row.querySelector('dd')?.classList).toContain('is-empty');
  });

  it('shows the date and Atrasado há 2 dias', async () => {
    const { host, sidePairs } = await setup({
      rma: { ...fullRma, dueDate: '2026-10-18', deadline: { status: 'OVERDUE', dueSoonFrom: '2026-10-11', daysUntilDue: -2 } }
    });
    expect(sidePairs()['Data limite']).toContain('18/10/2026');
    const chip = host.querySelector('.rma-detail__side .deadline-chip');
    expect(chip?.textContent?.trim()).toBe('Atrasado há 2 dias');
    expect(chip?.getAttribute('data-deadline')).toBe('OVERDUE');
  });

  it('makes the due date value clickable only with rma.editar and emits the RMA saved inline', async () => {
    let view = await setup();
    expect(view.buttonByText('Alterar')).toBeUndefined();
    expect(view.host.querySelector('.rma-detail__deadline .due-date-field__trigger')).toBeNull();
    TestBed.resetTestingModule();

    view = await setup({ canEditDueDate: true, rma: { ...fullRma, dueDate: null } });
    const updated: RmaResponse[] = [];
    view.component.rmaUpdated.subscribe((rma) => updated.push(rma));
    expect(view.buttonByText('Alterar')).toBeUndefined();
    const trigger = view.host.querySelector<HTMLButtonElement>('.rma-detail__deadline .due-date-field__trigger')!;
    expect(trigger.querySelector('.due-date-field__text')?.textContent?.trim()).toBe('Sem data limite');
    trigger.click();
    view.fixture.detectChanges();
    expect(view.host.querySelector('app-rma-due-date-dialog, [role="dialog"] [role="dialog"]')).toBeNull();
    const input = view.host.querySelector<HTMLInputElement>('.rma-detail__deadline input[type="date"]')!;
    input.value = '2026-10-30';
    input.dispatchEvent(new Event('input'));
    input.closest('form')!.dispatchEvent(new Event('submit'));
    view.fixture.detectChanges();
    expect(updated.map((rma) => rma.dueDate)).toEqual(['2026-10-30']);
  });

  it('keeps the due date trigger inactive while disabled', async () => {
    const { host } = await setup({ canEditDueDate: true, disabled: true });
    expect(host.querySelector<HTMLButtonElement>('.rma-detail__deadline .due-date-field__trigger')!.disabled).toBe(true);
  });

  it('shows há 2 d 4 h in Nesta etapa and Encerrado em for closed RMAs', async () => {
    let view = await setup({ rma: { ...fullRma, stagePeriods: [{ status: 'TRIAGE', enteredAt: '2026-10-18T08:00:00Z', leftAt: null, durationSeconds: 0 }] } });
    expect(view.sidePairs()['Nesta etapa']).toBe('há 2 d 4 h');
    TestBed.resetTestingModule();

    view = await setup({ rma: { ...fullRma, status: 'COMPLETED', stagePeriods: [{ status: 'COMPLETED', enteredAt: '2026-10-19T13:00:00Z', leftAt: null, durationSeconds: 0 }] } });
    expect(view.sidePairs()['Nesta etapa']).toBe('Encerrado em 19/10/2026 10:00');
  });

  it('lists the time of each previous stage in Histórico', async () => {
    const { section } = await setup({
      rma: {
        ...fullRma,
        stagePeriods: [
          { status: 'RECEIVED', enteredAt: '2026-10-20T08:00:00Z', leftAt: '2026-10-20T10:00:00Z', durationSeconds: 7200 },
          { status: 'TRIAGE', enteredAt: '2026-10-20T10:00:00Z', leftAt: null, durationSeconds: 0 }
        ]
      }
    });
    const items = [...section('Histórico')!.querySelectorAll('app-rma-stage-times li')].map((item) => item.textContent?.trim());
    expect(items).toEqual(['Recebido · 2 h', 'Triagem · 2 h (atual)']);
  });

  it('shows due date changes with previous value and author', async () => {
    const { section } = await setup({
      rma: { ...fullRma, dueDateHistory: [{ previousDueDate: '2026-11-20', newDueDate: '2026-11-25', changedBy: 'carla', changedAt: '2026-10-20T11:30:00Z' }] }
    });
    const event = [...section('Histórico')!.querySelectorAll('.rma-detail__event')].find((item) => item.textContent?.includes('Data limite'))!;
    expect(event.querySelector('.rma-detail__due-date-event')?.textContent?.trim()).toBe('Data limite 20/11/2026 → 25/11/2026');
    expect(event.querySelector('strong')?.textContent?.trim()).toBe('carla');
  });

  it('puts every section and side card on a white card over the tinted canvas', async () => {
    const { host } = await setup();

    expect(host.querySelector('.rma-detail')!.classList).toContain('detail-surface');
    const cards = [...host.querySelectorAll('.rma-detail__section, .rma-detail__info')];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.classList.contains('detail-card'))).toBe(true);
  });

  it('focuses the panel on open', async () => {
    const { fixture, host } = await setup();
    await fixture.whenStable();

    expect(document.activeElement).toBe(host.querySelector('.rma-detail'));
  });
});

describe('RmaDetailModalComponent status selector', () => {
  const trigger = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.rma-detail__status .custom-select__trigger')!;
  const options = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('.rma-detail__status [role="option"]')];
  const key = (target: Element, name: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

  async function openMenu(fixture: ComponentFixture<RmaDetailModalComponent>, host: HTMLElement) {
    trigger(host).click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('shows the current status as a pill with a chevron that announces a listbox', async () => {
    const { host } = await setup();
    const button = trigger(host);

    expect(button.textContent?.trim()).toBe('Triagem');
    expect(button.getAttribute('data-status')).toBe('TRIAGE');
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Alterar status, atual: Triagem');
    expect(button.querySelector('.custom-select__icon svg')).not.toBeNull();
  });

  it('lists every stage, marking the current one, in a listbox', async () => {
    const { fixture, host } = await setup();
    await openMenu(fixture, host);

    const menu = host.querySelector('.rma-detail__status [role="listbox"]')!;
    expect(trigger(host).getAttribute('aria-expanded')).toBe('true');
    expect(trigger(host).getAttribute('aria-controls')).toBe(menu.id);
    expect(options(host).map((option) => option.getAttribute('data-status'))).toEqual([
      'RECEIVED', 'TRIAGE', 'IN_DIAGNOSIS', 'WAITING_PART', 'IN_REPAIR', 'IN_TESTS', 'COMPLETED', 'RETURNED', 'IRREPARABLE'
    ]);
    const current = options(host).find((option) => option.getAttribute('aria-selected') === 'true')!;
    expect(current.getAttribute('data-status')).toBe('TRIAGE');
    expect(current.querySelector('.custom-select__hint')?.textContent?.trim()).toBe('Status atual');
  });

  it('emits the picked status for the existing flow and returns focus to the pill', async () => {
    const { fixture, host, component } = await setup();
    const statusChange = vi.fn();
    component.rmaUpdated.subscribe(statusChange);
    await openMenu(fixture, host);

    options(host).find((option) => option.getAttribute('data-status') === 'IN_REPAIR')!.click();
    fixture.detectChanges();

    expect(statusChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: fullRma.id, status: 'IN_REPAIR' }));
    expect(host.querySelector('.rma-detail__status [role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger(host));
    expect(trigger(host).textContent?.trim()).toBe('Triagem');
  });

  it('does not emit when the current status is picked again', async () => {
    const { fixture, host, component } = await setup();
    const statusChange = vi.fn();
    component.rmaUpdated.subscribe(statusChange);
    await openMenu(fixture, host);

    options(host).find((option) => option.getAttribute('data-status') === 'TRIAGE')!.click();
    fixture.detectChanges();

    expect(statusChange).not.toHaveBeenCalled();
  });

  it('works from the keyboard: arrows open and move, Enter picks, Escape closes back to the pill', async () => {
    const { fixture, host, component } = await setup();
    const statusChange = vi.fn();
    component.rmaUpdated.subscribe(statusChange);

    trigger(host).focus();
    key(trigger(host), 'ArrowDown');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('data-status')).toBe('TRIAGE');

    key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement?.getAttribute('data-status')).toBe('IN_DIAGNOSIS');
    key(document.activeElement!, 'End');
    expect(document.activeElement?.getAttribute('data-status')).toBe('IRREPARABLE');
    key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement?.getAttribute('data-status')).toBe('RECEIVED');
    key(document.activeElement!, 'r');
    expect(document.activeElement?.getAttribute('data-status')).toBe('IN_REPAIR');

    // A focused button turns Enter into a click.
    (document.activeElement as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(statusChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: fullRma.id, status: 'IN_REPAIR' }));

    await openMenu(fixture, host);
    key(document.activeElement!, 'Escape');
    fixture.detectChanges();
    expect(host.querySelector('.rma-detail__status [role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger(host));
    expect(statusChange).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking outside', async () => {
    const { fixture, host } = await setup();
    await openMenu(fixture, host);

    document.body.click();
    fixture.detectChanges();

    expect(host.querySelector('.rma-detail__status [role="listbox"]')).toBeNull();
  });
});

describe('RmaDetailModalComponent assignee selector', () => {
  const assigned = { ...fullRma, assigneeId: 7, assigneeName: 'Ana Lima' };
  const trigger = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.rma-detail__assignee-picker .custom-select__trigger')!;
  const options = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('.rma-detail__assignee-picker [role="option"]')];
  const name = (option: Element) => option.querySelector('.custom-select__name')?.textContent?.trim();
  const key = (target: Element, value: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));

  it('shows the current assignee with avatar and chevron in Informações', async () => {
    const { host } = await setup({ rma: assigned });
    const button = trigger(host);

    expect(host.querySelector('.rma-detail__info .rma-detail__assignee-picker')).not.toBeNull();
    expect(button.querySelector('.avatar')?.textContent?.trim()).toBe('AL');
    expect(button.querySelector('.custom-select__label')?.textContent?.trim()).toBe('Ana Lima');
    expect(button.querySelector('.custom-select__icon svg')).not.toBeNull();
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button.getAttribute('aria-label')).toBe('Trocar responsável, atual: Ana Lima');
  });

  it('lists Sem responsável and the eligible users with avatar and username, the current one selected', async () => {
    const { fixture, host } = await setup({ rma: assigned });
    trigger(host).click();
    fixture.detectChanges();

    expect(options(host).map(name)).toEqual(['Sem responsável', 'Ana Lima', 'Bruno Costa', 'Beatriz Souza']);
    expect(options(host)[0].querySelector('.avatar--empty')).not.toBeNull();
    expect(options(host)[2].querySelector('.avatar')?.textContent?.trim()).toBe('BC');
    expect(options(host)[2].querySelector('.custom-select__hint')?.textContent?.trim()).toBe('@bruno');
    expect(options(host).filter((option) => option.getAttribute('aria-selected') === 'true').map(name)).toEqual(['Ana Lima']);
  });

  it('keeps a current assignee outside the eligible list visible but not choosable', async () => {
    const { fixture, host, component } = await setup({ rma: { ...fullRma, assigneeId: 40, assigneeName: 'Carlos Antigo' } });
    const assigneeChange = vi.fn();
    component.assigneeChange.subscribe(assigneeChange);
    expect(trigger(host).textContent).toContain('Carlos Antigo');
    trigger(host).click();
    fixture.detectChanges();

    const current = options(host).find((option) => name(option) === 'Carlos Antigo')!;
    expect(current.getAttribute('aria-disabled')).toBe('true');
    expect(current.querySelector('.custom-select__hint')?.textContent?.trim()).toBe('Não pode receber novas atribuições');
    current.click();
    fixture.detectChanges();
    expect(assigneeChange).not.toHaveBeenCalled();
  });

  it('emits the picked person (or null) and ignores the current one', async () => {
    const { fixture, host, component } = await setup({ rma: assigned });
    const assigneeChange = vi.fn();
    component.assigneeChange.subscribe(assigneeChange);
    const pick = (label: string) => {
      trigger(host).click();
      fixture.detectChanges();
      options(host).find((option) => name(option) === label)!.click();
      fixture.detectChanges();
    };

    pick('Ana Lima');
    pick('Bruno Costa');
    pick('Sem responsável');

    expect(assigneeChange.mock.calls).toEqual([[{ rma: assigned, assigneeId: 8 }], [{ rma: assigned, assigneeId: null }]]);
    expect(document.activeElement).toBe(trigger(host));
  });

  it('moves with arrows and typeahead, and Escape returns focus without choosing', async () => {
    const { fixture, host, component } = await setup({ rma: assigned });
    const assigneeChange = vi.fn();
    component.assigneeChange.subscribe(assigneeChange);

    trigger(host).focus();
    key(trigger(host), 'ArrowDown');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(name(document.activeElement!)).toBe('Ana Lima');
    key(document.activeElement!, 'b');
    expect(name(document.activeElement!)).toBe('Bruno Costa');
    key(document.activeElement!, 'e');
    expect(name(document.activeElement!)).toBe('Beatriz Souza');
    key(document.activeElement!, 'Home');
    expect(name(document.activeElement!)).toBe('Sem responsável');

    key(document.activeElement!, 'Escape');
    fixture.detectChanges();
    expect(host.querySelector('.rma-detail__assignee-picker [role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger(host));
    expect(assigneeChange).not.toHaveBeenCalled();
  });

  it('shows the action error from the host as an alert', async () => {
    const { fixture, host } = await setup({ rma: assigned });
    fixture.componentRef.setInput('actionError', 'Técnico inativo');
    fixture.detectChanges();

    expect(host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Técnico inativo');
  });
});

describe('RmaDetailModalComponent priority selector', () => {
  const priorityRow = (host: HTMLElement) =>
    [...host.querySelectorAll<HTMLElement>('.rma-detail__side dl > div')].find((row) => row.querySelector('dt')?.textContent?.trim() === 'Prioridade')!;

  it('changes the priority from the Informações side and emits the saved RMA', async () => {
    const { fixture, host, component } = await setup({ canEditDueDate: true });
    const updated: RmaResponse[] = [];
    component.rmaUpdated.subscribe((rma) => updated.push(rma));
    const trigger = priorityRow(host).querySelector<HTMLButtonElement>('app-rma-priority-field .custom-select__trigger')!;
    expect(trigger.getAttribute('aria-label')).toBe('Alterar prioridade, atual: Alta');
    expect(trigger.querySelector('.priority-bars[data-priority="HIGH"]')).not.toBeNull();
    trigger.click();
    fixture.detectChanges();
    [...host.querySelectorAll<HTMLButtonElement>('.custom-select__option')].find((option) => option.textContent?.includes('Baixa'))!.click();
    fixture.detectChanges();
    expect(updated.map((rma) => rma.priority)).toEqual(['LOW']);
    expect(priorityRow(host).querySelector('[role="status"]')?.textContent?.trim()).toBe('Prioridade alterada para Baixa');
  });

  it('keeps the priority read only without rma.editar or for a closed RMA', async () => {
    let view = await setup({ canEditDueDate: false });
    expect(priorityRow(view.host).querySelector('.custom-select__trigger')).toBeNull();
    expect(priorityRow(view.host).querySelector('.priority-tag')?.textContent?.trim()).toBe('Alta');
    TestBed.resetTestingModule();
    view = await setup({ canEditDueDate: true, rma: { ...fullRma, status: 'COMPLETED' } });
    expect(priorityRow(view.host).querySelector('.custom-select__trigger')).toBeNull();
  });

  it('keeps the priority selector inactive while disabled', async () => {
    const { host } = await setup({ canEditDueDate: true, disabled: true });
    expect(priorityRow(host).querySelector<HTMLButtonElement>('.custom-select__trigger')!.disabled).toBe(true);
  });
});
