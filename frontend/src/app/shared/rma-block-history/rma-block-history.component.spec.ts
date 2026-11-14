import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaBlockResponse, RmaResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { RmaBlockHistoryComponent } from './rma-block-history.component';

describe('RmaBlockHistoryComponent', () => {
  let fixture: ComponentFixture<RmaBlockHistoryComponent>;
  let clock: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    clock = signal(Date.parse('2026-10-20T12:00:00Z'));
    await TestBed.configureTestingModule({
      imports: [RmaBlockHistoryComponent],
      providers: [{ provide: ClockService, useValue: { now: clock.asReadonly() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(RmaBlockHistoryComponent);
  });

  function render(rma: RmaResponse): HTMLElement {
    fixture.componentRef.setInput('rma', rma);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const episodes = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('ol.record-list > li')];
  const facts = (episode: HTMLElement) => new Map(
    [...episode.querySelectorAll('dl > div')].map((pair) => [text(pair.querySelector('dt')), pair.querySelector('dd')!] as const)
  );

  // Vermelho: o início aparece como <time> solto, sem rótulo, e a nota de resolução não é identificada.
  it('labels the start, duration and resolution of each episode', () => {
    render({ ...RMA, currentBlock: ACTIVE, blockHistory: [RESOLVED, ACTIVE] });
    const [active, resolved] = episodes();

    const activeFacts = facts(active);
    expect([...activeFacts.keys()]).toEqual(['Motivo', 'Categoria', 'Início', 'Bloqueado por', 'Duração']);
    expect(text(activeFacts.get('Motivo'))).toBe('Aguardando peça');
    expect(text(activeFacts.get('Categoria'))).toBe('Peças');
    expect(text(activeFacts.get('Bloqueado por'))).toBe('tech');
    expect(text(activeFacts.get('Duração'))).toBe('2 h');
    const start = activeFacts.get('Início')!.querySelector('time');
    expect(start?.getAttribute('datetime')).toBe('2026-10-20T10:00:00Z');
    expect(text(start)).toBe('20/10/2026, 07:00');
    expect(text(active.querySelector('.mini-chip'))).toBe('Bloqueado');

    const resolvedFacts = facts(resolved);
    expect([...resolvedFacts.keys()]).toEqual(['Motivo', 'Categoria', 'Início', 'Bloqueado por', 'Duração', 'Resolvido em', 'Resolvido por', 'Nota de resolução']);
    expect(text(resolvedFacts.get('Categoria'))).toBe('Sem categoria');
    expect(text(resolvedFacts.get('Duração'))).toBe('1 h');
    expect(resolvedFacts.get('Resolvido em')!.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-19T09:00:00Z');
    expect(text(resolvedFacts.get('Resolvido em'))).toBe('19/10/2026, 06:00');
    expect(text(resolvedFacts.get('Resolvido por'))).toBe('desk');
    expect(text(resolvedFacts.get('Nota de resolução'))).toBe('Peça recebida');
    expect(text(resolved.querySelector('.mini-chip'))).toBe('Resolvido');
  });

  // Vermelho: o episódio ativo não tem duração identificada na lista.
  it('updates the duration of an active episode without changing the resolved duration', () => {
    const rma = { ...RMA, currentBlock: ACTIVE, blockHistory: [ACTIVE, RESOLVED] };
    render(rma);
    const duration = (index: number) => text(facts(episodes()[index]).get('Duração'));
    expect(duration(0)).toBe('2 h');
    expect(duration(1)).toBe('1 h');

    clock.set(Date.parse('2026-10-20T12:30:00Z'));
    fixture.detectChanges();

    expect(duration(0)).toBe('2 h 30 min');
    expect(duration(1)).toBe('1 h');
    expect(fixture.componentInstance.rma()).toBe(rma);
  });

  it('preserves the descending order without mutating the input history', () => {
    const older = { ...RESOLVED, id: 3, reason: 'Mais antigo', blockedAt: '2026-10-18T08:00:00Z', resolvedAt: '2026-10-18T09:00:00Z' };
    const tie = { ...RESOLVED, id: 7, reason: 'Mesmo início, id maior' };
    const history = [older, RESOLVED, ACTIVE, tie];
    render({ ...RMA, currentBlock: ACTIVE, blockHistory: history });
    expect(episodes().map((episode) => text(facts(episode).get('Motivo') ?? episode.querySelector('p')))).toEqual(['Aguardando peça', 'Mesmo início, id maior', 'Falha no fornecedor', 'Mais antigo']);
    expect(history.map((block) => block.id)).toEqual([3, 5, 9, 7]);
  });

  it('preserves the current block summary', () => {
    const element = render({ ...RMA, currentBlock: ACTIVE, blockHistory: [ACTIVE] });
    expect(text(element.querySelector('.block-history__current strong'))).toBe('Impedida há 2 h');
    expect(text(element.querySelector('.block-history__current'))).toContain('Aguardando peça');
    expect(text(element)).not.toContain('Sem bloqueio atual.');
  });

  it('preserves distinct states for no current block and no history', () => {
    const element = render(RMA);
    expect(text(element)).toContain('Sem bloqueio atual.');
    expect(text(element)).toContain('Nenhum impedimento registrado.');
    expect(element.querySelector('ol')).toBeNull();

    render({ ...RMA, blockHistory: [RESOLVED] });
    expect(text(element)).toContain('Sem bloqueio atual.');
    expect(text(element)).not.toContain('Nenhum impedimento registrado.');
    expect(text(element)).toContain('Falha no fornecedor');
  });

  it('preserves long texts in full and offers no write controls', () => {
    const reason = 'Motivo '.repeat(140).trim();
    const note = 'Nota '.repeat(190).trim();
    const element = render({ ...RMA, blockHistory: [{ ...RESOLVED, reason, resolutionNote: note }] });
    expect(text(element)).toContain(reason);
    expect(text(element)).toContain(note);
    expect(element.querySelector('button, form, input, textarea, select')).toBeNull();
  });
});

const ACTIVE: RmaBlockResponse = { id: 9, reason: 'Aguardando peça', category: 'Peças', blockedBy: 'tech', blockedAt: '2026-10-20T10:00:00Z', resolvedBy: null, resolvedAt: null, resolutionNote: null };
const RESOLVED: RmaBlockResponse = { id: 5, reason: 'Falha no fornecedor', category: null, blockedBy: 'admin', blockedAt: '2026-10-19T08:00:00Z', resolvedBy: 'desk', resolvedAt: '2026-10-19T09:00:00Z', resolutionNote: 'Peça recebida' };
const RMA: RmaResponse = {
  id: 1, code: 'OS-2026-000001', clientName: 'Cliente', items: [],
  purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-10-20', invoiceNumber: null, receivedBy: 'desk', reportedFailure: 'Falha', receivedAccessories: null, physicalCondition: null,
  priority: 'MEDIUM', status: 'TRIAGE', dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null }, stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T10:00:00Z', leftAt: null, durationSeconds: 0 }], dueDateHistory: [], warrantyHistory: [],
  assigneeId: null, assigneeName: null, repairSummary: null, replacedPartsSummary: null, testSummary: null, carrier: null, trackingCode: null, diagnosis: null, statusHistory: [], assignmentHistory: [],
  currentBlock: null, blockHistory: [], createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z',
};
