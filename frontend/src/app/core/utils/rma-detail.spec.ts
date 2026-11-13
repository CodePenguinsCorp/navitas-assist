import { DiagnosisResponse, RmaAssignmentHistoryResponse, RmaBlockResponse, RmaStatusHistoryResponse, WarrantyStatus } from '../models';
import { buildRma, buildRmaItem } from '../../testing/rma-fixtures';
import {
  NO_DIAGNOSIS_LABEL,
  RMA_DETAIL_SECTIONS,
  blockedLabel,
  diagnosisFacts,
  invoiceFact,
  purchaseFact,
  receiptFacts,
  repairFacts,
  rmaHistory,
  rmaItemFacts,
  sectionLabel,
  warrantyExpiryLabel,
  warrantyTermLabel
} from './rma-detail';

// Hoje o módulo ./rma-detail não existe: o vermelho é de resolução do import (compilação).

const diagnosis: DiagnosisResponse = {
  id: 1, foundFailure: 'Capacitor estufado', failureType: 'POWER_SUPPLY', probableCause: 'COMPONENT',
  notes: 'Trocar lote', diagnosedAt: '2026-10-21', technicianName: 'Bia',
  createdAt: '2026-10-21T12:00:00Z', updatedAt: '2026-10-21T12:00:00Z'
};

function statusRecord(overrides: Partial<RmaStatusHistoryResponse> = {}): RmaStatusHistoryResponse {
  return { status: 'TRIAGE', changedBy: 'ana', changedAt: '2026-10-20T12:00:00Z', note: null, ...overrides };
}

function assigneeRecord(overrides: Partial<RmaAssignmentHistoryResponse> = {}): RmaAssignmentHistoryResponse {
  return {
    previousAssigneeId: null, previousAssigneeName: null, newAssigneeId: 7, newAssigneeName: 'Ana',
    changedBy: 'bia', changedAt: '2026-10-20T12:00:00Z', ...overrides
  };
}

const labels = (facts: { label: string }[]) => facts.map((fact) => fact.label);

describe('RMA detail contract', () => {
  it('lists the nine sections in contract order', () => {
    expect(RMA_DETAIL_SECTIONS.map((section) => section.label)).toEqual([
      'Falha relatada', 'Produtos', 'Recebimento', 'Diagnóstico', 'Reparo e testes',
      'Peças', 'Protocolos', 'Impedimentos', 'Histórico'
    ]);
    expect(sectionLabel('products')).toBe('Produtos');
    expect(sectionLabel('repair')).toBe('Reparo e testes');
    expect(sectionLabel('history')).toBe('Histórico');
  });

  it('formats warranty term in singular and plural', () => {
    expect(warrantyTermLabel(1)).toBe('1 mês');
    expect(warrantyTermLabel(12)).toBe('12 meses');
    expect(warrantyTermLabel(0)).toBe('0 meses');
  });

  it('shows the expiry date or Sem data da compra', () => {
    expect(warrantyExpiryLabel({ warrantyExpiresAt: '2027-01-15' })).toEqual({ label: 'Vencimento', value: '15/01/2027', empty: false });
    expect(warrantyExpiryLabel({ warrantyExpiresAt: null })).toEqual({ label: 'Vencimento', value: 'Sem data da compra', empty: true });
  });

  it('distinguishes unknown purchase from missing purchase', () => {
    expect(purchaseFact({ purchaseDate: null, purchaseDateUnknown: true })).toEqual({ label: 'Compra', value: 'Desconhecida', empty: true });
    expect(purchaseFact({ purchaseDate: null, purchaseDateUnknown: false })).toEqual({ label: 'Compra', value: 'Não informada', empty: true });
    expect(purchaseFact({ purchaseDate: '2026-10-20', purchaseDateUnknown: false })).toEqual({ label: 'Compra', value: '20/10/2026', empty: false });
  });

  it('labels invoice and identification gaps', () => {
    expect(invoiceFact({ invoiceNumber: null })).toEqual({ label: 'Nota fiscal', value: 'Não informada', empty: true });
    expect(invoiceFact({ invoiceNumber: '  ' })).toEqual({ label: 'Nota fiscal', value: 'Não informada', empty: true });
    expect(invoiceFact({ invoiceNumber: 'NF-1' })).toEqual({ label: 'Nota fiscal', value: 'NF-1', empty: false });

    const facts = rmaItemFacts(buildRmaItem({ serialNumber: null, batchNumber: null }));
    expect(facts.find((fact) => fact.label === 'Série')).toEqual({ label: 'Série', value: 'Não informada', empty: true });
    expect(facts.find((fact) => fact.label === 'Lote')).toEqual({ label: 'Lote', value: 'Não informado', empty: true });
  });

  it('includes manufacture only when present', () => {
    const item = buildRmaItem({
      productSku: 'SKU-9', serialNumber: 'S1', batchNumber: 'L1', warrantyMonths: 1,
      warrantyExpiresAt: '2026-11-20', warrantyStatus: WarrantyStatus.IN_WARRANTY
    });
    expect(rmaItemFacts(item)).toEqual([
      { label: 'SKU', value: 'SKU-9', empty: false },
      { label: 'Série', value: 'S1', empty: false },
      { label: 'Lote', value: 'L1', empty: false },
      { label: 'Prazo de garantia', value: '1 mês', empty: false },
      { label: 'Vencimento', value: '20/11/2026', empty: false }
    ]);
    expect(labels(rmaItemFacts({ ...item, manufacturedAt: '2026-01-05' }))).toEqual([
      'SKU', 'Série', 'Lote', 'Fabricação', 'Prazo de garantia', 'Vencimento'
    ]);
    expect(rmaItemFacts({ ...item, manufacturedAt: '2026-01-05' })[3].value).toBe('05/01/2026');
  });

  it('returns receipt and repair facts only when filled, with the creation labels', () => {
    expect(receiptFacts(buildRma())).toEqual([]);
    expect(receiptFacts(buildRma({ receivedAccessories: '  ', physicalCondition: 'Riscado' }))).toEqual([
      { label: 'Condição física', value: 'Riscado', empty: false }
    ]);
    expect(labels(receiptFacts(buildRma({ receivedAccessories: 'Fonte', physicalCondition: 'Riscado' })))).toEqual(['Acessórios', 'Condição física']);

    expect(repairFacts(buildRma())).toEqual([]);
    const long = 'x'.repeat(600);
    expect(repairFacts(buildRma({ repairSummary: long, replacedPartsSummary: 'Fonte', testSummary: 'Bancada ok' }))).toEqual([
      { label: 'Reparo', value: long, empty: false },
      { label: 'Peças trocadas', value: 'Fonte', empty: false },
      { label: 'Testes', value: 'Bancada ok', empty: false }
    ]);
    expect(labels(repairFacts(buildRma({ testSummary: 'Bancada ok' })))).toEqual(['Testes']);
  });

  it('returns six diagnosis facts with date and technician, notes only when present', () => {
    expect(diagnosisFacts(diagnosis)).toEqual([
      { label: 'Falha encontrada', value: 'Capacitor estufado', empty: false },
      { label: 'Tipo', value: 'Fonte', empty: false },
      { label: 'Causa provável', value: 'Componente', empty: false },
      { label: 'Data do diagnóstico', value: '21/10/2026', empty: false },
      { label: 'Técnico', value: 'Bia', empty: false },
      { label: 'Notas', value: 'Trocar lote', empty: false }
    ]);

    const bare = diagnosisFacts({ ...diagnosis, foundFailure: null, failureType: null, probableCause: null, technicianName: ' ', notes: null, diagnosedAt: null });
    expect(labels(bare)).toEqual(['Falha encontrada', 'Tipo', 'Causa provável', 'Data do diagnóstico', 'Técnico']);
    expect(bare[0]).toEqual({ label: 'Falha encontrada', value: 'Não informada', empty: true });
    expect(bare[1]).toEqual({ label: 'Tipo', value: 'Não classificado', empty: true });
    expect(bare[2]).toEqual({ label: 'Causa provável', value: 'Não classificada', empty: true });
    expect(bare[4]).toEqual({ label: 'Técnico', value: 'Não informado', empty: true });
    expect(NO_DIAGNOSIS_LABEL).toBe('Sem diagnóstico registrado.');
  });

  it('labels every status record as Status registrado without inferring a transition', () => {
    const history = rmaHistory({
      statusHistory: [
        statusRecord({ changedAt: '2026-10-20T12:00:00Z' }),
        statusRecord({ changedAt: '2026-10-20T13:00:00Z', note: 'Prioridade alterada' })
      ],
      assignmentHistory: []
    });

    expect(history).toHaveLength(2);
    for (const entry of history) {
      expect(entry.kind).toBe('status');
      expect(JSON.stringify(entry)).not.toContain('Moveu');
      expect(entry).not.toHaveProperty('from');
      if (entry.kind === 'status') expect(entry.label).toBe('Status registrado: Triagem');
    }
  });

  it('keeps a note recorded without a status change', () => {
    const [entry] = rmaHistory({ statusHistory: [statusRecord({ status: 'IN_REPAIR', note: 'Cliente avisado' })], assignmentHistory: [] });
    expect(entry).toEqual({
      kind: 'status', at: '2026-10-20T12:00:00Z', by: 'ana', label: 'Status registrado: Reparo', status: 'IN_REPAIR', note: 'Cliente avisado'
    });
  });

  it('orders by instant, newest first, and keeps input order on ties', () => {
    const history = rmaHistory({
      statusHistory: [statusRecord({ changedAt: '2026-10-20T10:00:00Z' }), statusRecord({ changedAt: '2026-10-20T12:00:00Z', status: 'IN_DIAGNOSIS' })],
      assignmentHistory: [assigneeRecord({ changedAt: '2026-10-20T12:00:00Z' }), assigneeRecord({ changedAt: '2026-10-20T11:00:00Z', newAssigneeName: 'Bia' })]
    });

    expect(history.map((entry) => [entry.kind, entry.at])).toEqual([
      ['status', '2026-10-20T12:00:00Z'],
      ['assignee', '2026-10-20T12:00:00Z'],
      ['assignee', '2026-10-20T11:00:00Z'],
      ['status', '2026-10-20T10:00:00Z']
    ]);
  });

  it('does not mutate the input arrays', () => {
    const statusHistory = Object.freeze([statusRecord({ changedAt: '2026-10-20T10:00:00Z' }), statusRecord({ changedAt: '2026-10-20T12:00:00Z' })]);
    const assignmentHistory = Object.freeze([assigneeRecord({ changedAt: '2026-10-20T11:00:00Z' })]);
    const statusCopy = JSON.parse(JSON.stringify(statusHistory));
    const assignmentCopy = JSON.parse(JSON.stringify(assignmentHistory));

    expect(() => rmaHistory({
      statusHistory: statusHistory as RmaStatusHistoryResponse[],
      assignmentHistory: assignmentHistory as RmaAssignmentHistoryResponse[]
    })).not.toThrow();
    expect(statusHistory).toEqual(statusCopy);
    expect(assignmentHistory).toEqual(assignmentCopy);
  });

  it('uses Sem responsável for empty assignee ends', () => {
    const history = rmaHistory({
      statusHistory: [],
      assignmentHistory: [
        assigneeRecord({ changedAt: '2026-10-20T12:00:00Z', previousAssigneeName: null, newAssigneeName: 'Ana' }),
        assigneeRecord({ changedAt: '2026-10-20T11:00:00Z', previousAssigneeName: 'Ana', newAssigneeName: '  ' })
      ]
    });
    expect(history).toEqual([
      { kind: 'assignee', at: '2026-10-20T12:00:00Z', by: 'bia', from: 'Sem responsável', to: 'Ana' },
      { kind: 'assignee', at: '2026-10-20T11:00:00Z', by: 'bia', from: 'Ana', to: 'Sem responsável' }
    ]);
  });

  it('formats the active block duration', () => {
    const block: RmaBlockResponse = {
      id: 1, reason: 'Peça pendente', category: null, blockedBy: 'ana', blockedAt: '2026-10-20T10:00:00Z',
      resolvedBy: null, resolvedAt: null, resolutionNote: null
    };
    expect(blockedLabel(block, Date.parse('2026-10-20T12:05:00Z'))).toBe('Bloqueado há 2 h 5 min');
    expect(blockedLabel(block, Date.parse('2026-10-20T10:30:00Z'))).toBe('Bloqueado há 30 min');
  });
});
