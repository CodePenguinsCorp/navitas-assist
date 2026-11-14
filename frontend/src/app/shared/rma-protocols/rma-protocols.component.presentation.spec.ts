import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ProtocolExecutionItemResponse, ProtocolExecutionResponse, ProtocolItemResultResponse } from '../../core/models';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { ProtocolService } from '../../core/services/protocol.service';
import { formatBusinessDateTime } from '../../core/utils/date';
import { RmaProtocolsComponent } from './rma-protocols.component';

const FIRST: ProtocolItemResultResponse = {
  id: 30, attempt: 1, outcome: 'PASSED', measuredValue: '12.10', unit: 'V', textValue: null, evidence: 'Foto da bancada', justification: null,
  executedBy: 'ana', startedAt: '2026-10-20T12:00:00Z', completedAt: '2026-10-20T12:05:00Z'
};
const LATEST: ProtocolItemResultResponse = { ...FIRST, id: 31, attempt: 2, outcome: 'FAILED', measuredValue: '0', evidence: 'Foto após ajuste', justification: 'Repetição após ajuste', executedBy: 'bruno', completedAt: '2026-10-20T13:00:00Z' };
const MEASUREMENT: ProtocolExecutionItemResponse = {
  item: { id: 21, sortOrder: 1, stepName: 'Medições', title: 'Tensão', instructions: 'Medir nos terminais da placa.', type: 'MEASUREMENT', required: true,
    unit: 'V', decimalPlaces: 2, minValue: 11.5, maxValue: 12.5, expectedResult: 'Entre 11,50 V e 12,50 V', evidenceRequired: true },
  latest: LATEST, attempts: [FIRST, LATEST]
};
const CHECK: ProtocolExecutionItemResponse = {
  item: { ...MEASUREMENT.item, id: 22, sortOrder: 2, stepName: 'Inspeção', title: 'Conector', type: 'CHECK', unit: null, decimalPlaces: null, minValue: null, maxValue: null },
  latest: { ...FIRST, id: 32, measuredValue: null, unit: null, outcome: 'NOT_APPLICABLE', justification: 'Modelo sem conector' },
  attempts: [{ ...FIRST, id: 32, measuredValue: null, unit: null, outcome: 'NOT_APPLICABLE', justification: 'Modelo sem conector' }]
};
const OPTIONAL: ProtocolExecutionItemResponse = { item: { ...CHECK.item, id: 23, sortOrder: 3, required: false, title: 'Foto final' }, latest: null, attempts: [] };
const EXECUTION: ProtocolExecutionResponse = {
  id: 9, rmaId: 4, rmaCode: 'OS-4', templateId: 2, templateName: 'Bancada PWM', versionNumber: 3, status: 'IN_PROGRESS',
  blockedStatuses: ['IN_TESTS'], startedBy: 'tech', startedAt: '2026-10-20T12:00:00Z', completedBy: null, completedAt: null,
  totalItems: 3, completedItems: 2, requiredItems: 2, pendingRequiredItems: 1, failedItems: 1, items: [MEASUREMENT, CHECK, OPTIONAL]
};

describe('RmaProtocolsComponent checklist', () => {
  let fixture: ComponentFixture<RmaProtocolsComponent>;
  let complete: ReturnType<typeof vi.fn>;
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const text = () => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();
  async function setup(execution = EXECUTION, role: LegacyProfileCode = 'TECHNICIAN') {
    complete = vi.fn(() => of({ ...execution, status: 'FAILED' }));
    await TestBed.configureTestingModule({ imports: [RmaProtocolsComponent], providers: [
      providePermissions(profilePermissions(role)),
      { provide: ProtocolService, useValue: { listExecutions: () => of([execution]), listTemplates: () => of([]), complete } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(RmaProtocolsComponent); fixture.componentRef.setInput('rmaId', 4); render();
  }

  it('shows version, state chip and compact progress in two short lines', async () => {
    await setup();
    expect(text()).toContain('Bancada PWM · v3'); expect(text()).toContain('Em andamento');
    expect(text()).toContain('1/2 obrigatórios · 2/3 registrados'); expect(text()).toContain('Iniciado por tech');
    expect(text()).not.toContain('itens registrados'); expect(text()).not.toContain('Etapa:'); expect(text()).not.toContain('Sem registro');
    const head = fixture.nativeElement.querySelector('.protocol-head') as HTMLElement;
    expect(head.querySelector('.mini-chip')?.textContent?.trim()).toBe('Em andamento');
    expect(head.querySelector('button')?.textContent?.trim()).toBe('Concluir protocolo');
    const bar = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0'); expect(bar?.getAttribute('aria-valuenow')).toBe('1'); expect(bar?.getAttribute('aria-valuemax')).toBe('2');
    expect(bar?.getAttribute('aria-label')).toContain('Bancada PWM');
  });

  it('shows no bar when there are no required items', async () => {
    await setup({ ...EXECUTION, requiredItems: 0, pendingRequiredItems: 0 });
    expect(text()).toContain('Sem obrigatórios · 2/3 registrados'); expect(fixture.nativeElement.querySelector('.protocol-progress')).toBeNull();
  });

  it('groups items by step only when there is more than one step', async () => {
    await setup();
    const groups = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.protocol-group')).map((e) => e.textContent?.trim());
    expect(groups).toEqual(['Medições', 'Inspeção']);
    expect(fixture.nativeElement.querySelectorAll('.protocol-row')).toHaveLength(3);
    TestBed.resetTestingModule();
    await setup({ ...EXECUTION, items: [MEASUREMENT] });
    expect(fixture.nativeElement.querySelector('.protocol-group')).toBeNull();
  });

  it('marks required items with a chip and optional ones as plain muted text', async () => {
    await setup();
    const rows = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.protocol-row'));
    expect(rows[0].querySelector('.protocol-tag--required')?.textContent?.trim()).toBe('Obrigatório');
    expect(rows[2].querySelector('.protocol-tag--required')).toBeNull();
    expect(rows[2].querySelector('.protocol-row__optional')?.textContent?.trim()).toBe('Opcional');
    expect(rows[2].textContent).toContain('Pendente');
  });

  it.each([
    { min: 11.5, max: 12.5, places: 2, range: '11,5–12,5 V' },
    { min: 0.000125, max: null, places: 6, range: '≥ 0,000125 V' },
    { min: null, max: -0.000125, places: null, range: '≤ -0,000125 V' },
    { min: null, max: null, places: 0, range: null }
  ])('shows the expected range as an inline chip ($range)', async ({ min, max, places, range }) => {
    await setup({ ...EXECUTION, items: [{ ...MEASUREMENT, item: { ...MEASUREMENT.item, minValue: min, maxValue: max, decimalPlaces: places } }] });
    const tags = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.protocol-row__title .protocol-tag:not(.protocol-tag--required)'));
    if (range) expect(tags.map((t) => t.textContent?.replace(/\s+/g, ' ').trim())).toEqual([`Faixa esperada: ${range}`]); else expect(tags).toHaveLength(0);
    expect(text()).not.toContain('Mínimo:'); expect(text()).not.toContain('Máximo:');
  });

  it('shows the last record on one line only when it exists', async () => {
    await setup();
    const rows = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.protocol-row'));
    expect(rows[0].querySelector('.protocol-row__last')?.textContent?.trim()).toBe(`0 V · bruno em ${formatBusinessDateTime(LATEST.completedAt)} · tentativa 2`);
    expect(rows[0].textContent).toContain('Reprovado');
    expect(rows[2].querySelector('.protocol-row__last')).toBeNull();
  });

  it('collapses expected result, instructions and attempts behind a chevron', async () => {
    await setup();
    expect(text()).not.toContain('Resultado esperado'); expect(text()).not.toContain('Tentativa 1');
    const toggle = fixture.nativeElement.querySelector('.protocol-row__toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false'); expect(toggle.getAttribute('aria-label')).toBe('Ver detalhes de Tensão');
    toggle.click(); render();
    expect(toggle.getAttribute('aria-expanded')).toBe('true'); expect(toggle.getAttribute('aria-label')).toBe('Recolher detalhes de Tensão');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).not.toBeNull();
    expect(text()).toContain('Resultado esperado'); expect(text()).toContain('Entre 11,50 V e 12,50 V'); expect(text()).toContain('Medir nos terminais da placa.');
    toggle.click(); render(); expect(text()).not.toContain('Resultado esperado');
  });

  it('reads all attempts with evidence and justification for viewers', async () => {
    await setup(EXECUTION, 'VIEWER');
    expect(fixture.nativeElement.querySelectorAll('.protocol-row__action')).toHaveLength(0);
    (fixture.nativeElement.querySelector('.protocol-row__toggle') as HTMLButtonElement).click(); render();
    const history = fixture.nativeElement.querySelector('ol[aria-label="Histórico de resultados"]') as HTMLElement;
    expect(history.querySelectorAll('li')).toHaveLength(2);
    expect(history.textContent).toContain('Foto da bancada'); expect(history.textContent).toContain('Repetição após ajuste');
    expect(history.textContent).toContain('ana'); expect(history.textContent).toContain('bruno');
    expect(history.textContent).toContain(formatBusinessDateTime(FIRST.completedAt));
    expect(history.textContent).toContain(formatBusinessDateTime(LATEST.completedAt));
    expect(history.textContent).toContain('12.10 V'); expect(history.textContent).toContain('0 V');
    expect(text()).toContain('Reprovado');
    expect(Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).every((b) => b.classList.contains('protocol-row__toggle'))).toBe(true);
  });

  it('preserves API item order and allows completion with a failed required item', async () => {
    await setup({ ...EXECUTION, completedItems: 3, items: [MEASUREMENT, CHECK, { ...OPTIONAL, latest: FIRST, attempts: [FIRST] }] });
    const titles = text(); expect(titles.indexOf('Tensão')).toBeLessThan(titles.indexOf('Conector')); expect(titles.indexOf('Conector')).toBeLessThan(titles.indexOf('Foto final'));
    const finish = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith('Concluir'))!;
    expect(finish.disabled).toBe(false); finish.click(); render();
    expect(complete).toHaveBeenCalledWith(9); expect(text()).toContain('Concluído com reprovação');
  });
});
