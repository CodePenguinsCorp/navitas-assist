import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ProtocolExecutionItemResponse, ProtocolExecutionResponse, ProtocolItemResultResponse, UserRole } from '../../core/models';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';
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
  id: 9, rmaId: 4, rmaCode: 'RMA-4', templateId: 2, templateName: 'Bancada PWM', versionNumber: 3, status: 'IN_PROGRESS',
  blockedStatuses: ['IN_TESTS'], startedBy: 'tech', startedAt: '2026-10-20T12:00:00Z', completedBy: null, completedAt: null,
  totalItems: 3, completedItems: 2, requiredItems: 2, pendingRequiredItems: 1, failedItems: 1, items: [MEASUREMENT, CHECK, OPTIONAL]
};

describe('RmaProtocolsComponent checklist', () => {
  let fixture: ComponentFixture<RmaProtocolsComponent>;
  let complete: ReturnType<typeof vi.fn>;
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const text = () => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();
  async function setup(execution = EXECUTION, role: UserRole = 'TECHNICIAN') {
    complete = vi.fn(() => of({ ...execution, status: 'FAILED' }));
    await TestBed.configureTestingModule({ imports: [RmaProtocolsComponent], providers: [
      providePermissions(profilePermissions(role)),
      { provide: ProtocolService, useValue: { listExecutions: () => of([execution]), listTemplates: () => of([]), complete } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(RmaProtocolsComponent); fixture.componentRef.setInput('rmaId', 4); render();
  }

  // Vermelho: só há uma medida concatenada, sem contagem de obrigatórios ou progressbar semântico.
  it('separates protocol version, state and both real measures', async () => {
    await setup();
    expect(text()).toContain('Bancada PWM · v3'); expect(text()).toContain('Em andamento');
    expect(text()).toContain('2/3 itens registrados'); expect(text()).toContain('1/2 obrigatórios atendidos');
    const bar = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0'); expect(bar?.getAttribute('aria-valuenow')).toBe('1'); expect(bar?.getAttribute('aria-valuemax')).toBe('2');
    expect(bar?.getAttribute('aria-label')).toContain('Bancada PWM');
  });

  // Vermelho: sem obrigatórios a barra atual continua exibindo o percentual dos opcionais.
  it('shows no bar when there are no required items', async () => {
    await setup({ ...EXECUTION, requiredItems: 0, pendingRequiredItems: 0 });
    expect(text()).toContain('Sem itens obrigatórios'); expect(fixture.nativeElement.querySelector('.protocol-progress')).toBeNull();
    expect(text()).toContain('2/3 itens registrados');
  });

  // Vermelho: depois do registro desaparecem esperado/instruções, e a faixa não é apresentada.
  it.each([
    { min: 11.5, max: 12.5, places: 2, expectedMin: 'Mínimo: 11,5 V', expectedMax: 'Máximo: 12,5 V' },
    { min: 0.000125, max: null, places: 6, expectedMin: 'Mínimo: 0,000125 V', expectedMax: null },
    { min: null, max: -0.000125, places: null, expectedMin: null, expectedMax: 'Máximo: -0,000125 V' },
    { min: null, max: null, places: 0, expectedMin: null, expectedMax: null }
  ])('keeps expected range and instructions after a result ($expectedMin / $expectedMax)', async ({ min, max, places, expectedMin, expectedMax }) => {
    await setup({ ...EXECUTION, items: [{ ...MEASUREMENT, item: { ...MEASUREMENT.item, minValue: min, maxValue: max, decimalPlaces: places } }] });
    expect(text()).toContain('Resultado esperado'); expect(text()).toContain('Entre 11,50 V e 12,50 V');
    expect(text()).toContain('Medir nos terminais da placa.');
    if (expectedMin) expect(text()).toContain(expectedMin); else expect(text()).not.toContain('Mínimo:');
    if (expectedMax) expect(text()).toContain(expectedMax); else expect(text()).not.toContain('Máximo:');
    const title = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('strong')).find((e) => e.textContent?.trim() === 'Tensão');
    expect(title).toBeDefined(); expect(text()).toContain('Etapa: Medições'); expect(text()).toContain('Obrigatório');
    expect(text()).toContain('0 V');
  });

  // Vermelho: não existe leitura de todas as tentativas/evidências/justificativas.
  it('reads all attempts with evidence and justification for viewers', async () => {
    await setup(EXECUTION, 'VIEWER');
    expect(text()).toContain('Histórico de resultados');
    const history = fixture.nativeElement.querySelector('details') as HTMLDetailsElement | null;
    expect(history?.querySelector('summary')?.textContent).toContain('Histórico de resultados');
    history!.open = true; render();
    const attempts = history!.querySelectorAll('li'); expect(attempts).toHaveLength(2);
    expect(history!.textContent).toContain('Foto da bancada'); expect(history!.textContent).toContain('Repetição após ajuste');
    expect(history!.textContent).toContain('ana'); expect(history!.textContent).toContain('bruno');
    expect(history!.textContent).toContain(formatBusinessDateTime(FIRST.completedAt));
    expect(history!.textContent).toContain(formatBusinessDateTime(LATEST.completedAt));
    expect(history!.textContent).toContain('12.10 V'); expect(history!.textContent).toContain('0 V');
    expect(text()).toContain('Reprovado');
    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0);
  });

  it('preserves API item order and allows completion with a failed required item', async () => {
    await setup({ ...EXECUTION, completedItems: 3, items: [MEASUREMENT, CHECK, { ...OPTIONAL, latest: FIRST, attempts: [FIRST] }] });
    const titles = text(); expect(titles.indexOf('Tensão')).toBeLessThan(titles.indexOf('Conector')); expect(titles.indexOf('Conector')).toBeLessThan(titles.indexOf('Foto final'));
    const finish = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith('Concluir'))!;
    expect(finish.disabled).toBe(false); finish.click(); render();
    expect(complete).toHaveBeenCalledWith(9); expect(text()).toContain('Concluído com reprovação');
  });
});
