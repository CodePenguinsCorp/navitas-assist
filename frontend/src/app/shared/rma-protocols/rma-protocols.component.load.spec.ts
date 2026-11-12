import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ProtocolExecutionResponse, ProtocolTemplateResponse } from '../../core/models';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { ProtocolService } from '../../core/services/protocol.service';
import { RmaProtocolsComponent } from './rma-protocols.component';

const EXECUTION: ProtocolExecutionResponse = {
  id: 9, rmaId: 4, rmaCode: 'RMA-4', templateId: 2, templateName: 'Bancada PWM', versionNumber: 3, status: 'IN_PROGRESS',
  blockedStatuses: [], startedBy: 'tech', startedAt: '2026-10-20T12:00:00Z', completedBy: null, completedAt: null,
  totalItems: 1, completedItems: 0, requiredItems: 1, pendingRequiredItems: 1, failedItems: 0,
  items: [{ item: { id: 21, sortOrder: 1, stepName: 'Inspeção', title: 'Conector', instructions: null, type: 'CHECK', required: true,
    unit: null, decimalPlaces: null, minValue: null, maxValue: null, expectedResult: null, evidenceRequired: false }, latest: null, attempts: [] }]
};
const TEMPLATE: ProtocolTemplateResponse = {
  id: 2, name: 'Bancada PWM', currentVersion: 4, productId: null, productName: null, category: 'Placas', active: true,
  blockedStatuses: [], items: [], updatedAt: '2026-10-20T12:00:00Z'
};
type Harness = {
  selectTemplate(id: number | null): void; startExecution(): void;
  openResult(execution: ProtocolExecutionResponse, item: ProtocolExecutionResponse['items'][number]): void;
  saveResult(): void; completeExecution(execution: ProtocolExecutionResponse): void;
};

describe('RmaProtocolsComponent loading', () => {
  let fixture: ComponentFixture<RmaProtocolsComponent>;
  let service: { listExecutions: ReturnType<typeof vi.fn>; listTemplates: ReturnType<typeof vi.fn>; startExecution: ReturnType<typeof vi.fn>;
    recordResult: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn> };
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const text = () => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();
  const button = (label: string) => Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  const component = () => fixture.componentInstance as unknown as Harness;

  async function setup(sources: { role?: LegacyProfileCode; executions?: Observable<ProtocolExecutionResponse[]>; templates?: Observable<ProtocolTemplateResponse[]> } = {}) {
    service = {
      listExecutions: vi.fn(() => sources.executions ?? of([EXECUTION])), listTemplates: vi.fn(() => sources.templates ?? of([TEMPLATE])),
      startExecution: vi.fn(() => of(EXECUTION)), recordResult: vi.fn(() => of(EXECUTION)), complete: vi.fn(() => of(EXECUTION))
    };
    await TestBed.configureTestingModule({ imports: [RmaProtocolsComponent], providers: [
      providePermissions(profilePermissions(sources.role ?? 'TECHNICIAN')),
      { provide: ProtocolService, useValue: service }
    ] }).compileComponents();
    fixture = TestBed.createComponent(RmaProtocolsComponent);
    fixture.componentRef.setInput('rmaId', 4); render();
  }

  it('renders empty busy executions until an empty success', async () => {
    const pending = new Subject<ProtocolExecutionResponse[]>();
    await setup({ executions: pending });
    expectPending(fixture.nativeElement);
    expect(text()).not.toContain('Nenhum protocolo executado');
    pending.next([]); pending.complete(); render();
    expect(text()).toContain('Nenhum protocolo executado');
  });

  const expectFailure = () => {
    expect(text()).toContain('Não foi possível carregar os protocolos do RMA.');
    expect(text()).toContain('Tentar novamente');
    expect(text()).not.toContain('Nenhum protocolo executado');
    expect(fixture.nativeElement.querySelector('.protocol-execution')).toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  };

  // Vermelho: a falha aparece junto do vazio, sem recuperação.
  it('distinguishes executions failure from no execution', async () => {
    await setup({ executions: throwError(() => new Error()) }); expectFailure();
  });

  // Vermelho: a troca para um RMA com falha mantém execução ou vazio antigos.
  it.each([{ previous: [] }, { previous: [EXECUTION] }])('replaces a previous successful reading on a failing context change ($previous.length)', async ({ previous }) => {
    await setup({ executions: of(previous) });
    service.listExecutions.mockReturnValue(throwError(() => new Error()));
    fixture.componentRef.setInput('rmaId', 5); render(); expectFailure();
    expect(text()).not.toContain('Bancada PWM · v3');
  });

  // Vermelho: não existe retry que preserve a falha durante a nova leitura do RMA atual.
  it('retries executions for the current RMA', async () => {
    await setup();
    service.listExecutions.mockReturnValue(throwError(() => new Error()));
    fixture.componentRef.setInput('rmaId', 5); render();
    expect(button('Tentar novamente')).toBeDefined();
    const retry = new Subject<ProtocolExecutionResponse[]>(); service.listExecutions.mockReturnValue(retry);
    button('Tentar novamente')!.click(); render();
    expect(button('Tentar novamente')?.disabled).toBe(true);
    expect(text()).toContain('Não foi possível carregar os protocolos do RMA.');
    expect(text()).not.toContain('Bancada PWM · v3');
    retry.next([{ ...EXECUTION, rmaId: 5, templateName: 'Protocolo de B' }]); retry.complete(); render();
    expect(text()).toContain('Protocolo de B'); expect(text()).not.toContain('Não foi possível carregar os protocolos do RMA.');
    expect(service.listExecutions).toHaveBeenLastCalledWith(5);
  });

  it('keeps the template retry label and failure while the retry is pending', async () => {
    await setup({ templates: throwError(() => new Error()) });
    const retry$ = new Subject<ProtocolTemplateResponse[]>();
    service.listTemplates.mockReturnValue(retry$);
    button('Tentar novamente')!.click(); render();
    const launch = fixture.nativeElement.querySelector('.protocol-launch') as HTMLElement;
    expect(button('Tentar novamente')?.disabled).toBe(true);
    expect(launch.textContent).toContain('Não foi possível carregar as opções de protocolos.');
    expect(launch.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    retry$.next([TEMPLATE]); retry$.complete(); render();
    expect(text()).not.toContain('Não foi possível carregar as opções de protocolos.');
  });

  // Vermelho: o lançador some quando o catálogo falha, sem erro/retry local.
  it('reports template failure locally and retries without losing executions', async () => {
    const templates = new Subject<ProtocolTemplateResponse[]>();
    await setup({ templates });
    templates.error(new Error()); render();
    expect(fixture.nativeElement.querySelector('.protocol-launch')?.textContent).toContain('Não foi possível carregar as opções de protocolos.');
    expect(text()).toContain('Bancada PWM · v3'); expect(text()).not.toContain('Nenhum protocolo ativo disponível.');
    service.listTemplates.mockReturnValue(of([TEMPLATE]));
    button('Tentar novamente')!.click(); render();
    expect(text()).not.toContain('Não foi possível carregar as opções de protocolos.');
    expect(service.listExecutions).toHaveBeenCalledTimes(1);
  });

  // Vermelho: não há distinção entre catálogo pendente e catálogo sem opções ativas.
  it('does not present no active templates while still loading', async () => {
    const templates = new Subject<ProtocolTemplateResponse[]>(); await setup({ templates });
    expectPending(fixture.nativeElement); expect(text()).not.toContain('Nenhum protocolo ativo disponível.');
    templates.next([{ ...TEMPLATE, active: false }]); templates.complete(); render();
    expect(text()).toContain('Nenhum protocolo ativo disponível.'); expect(text()).not.toContain('Carregando opções de protocolos...');
  });

  // Vermelho: a resposta de A sobrescreve B e o editor de A permanece montado.
  it('does not overwrite another RMA with an old response', async () => {
    const first = new Subject<ProtocolExecutionResponse[]>(); await setup({ executions: first });
    first.next([EXECUTION]); render(); component().openResult(EXECUTION, EXECUTION.items[0]); component().selectTemplate(2); render();
    const second = new Subject<ProtocolExecutionResponse[]>(); service.listExecutions.mockReturnValue(second);
    fixture.componentRef.setInput('rmaId', 5); render();
    expect(text()).not.toContain('Bancada PWM · v3'); expect(fixture.nativeElement.querySelector('form')).toBeNull();
    second.next([{ ...EXECUTION, rmaId: 5, templateName: 'Protocolo de B', versionNumber: 7 }]); second.complete(); render();
    first.next([EXECUTION]); first.complete(); render();
    expect(text()).toContain('Protocolo de B · v7'); expect(text()).not.toContain('Bancada PWM · v3');
    expect(first.observed).toBe(false);
    component().startExecution(); expect(service.startExecution).not.toHaveBeenCalled();
  });

  // Vermelho: callbacks de escrita de A ainda atualizam a lista ou exibem erro em B.
  it.each(['start', 'record', 'complete'] as const)('ignores a late %s result and error after switching RMA', async (operation) => {
    await setup(); const write = new Subject<ProtocolExecutionResponse>();
    if (operation === 'start') { service.startExecution.mockReturnValue(write); component().selectTemplate(2); component().startExecution(); }
    if (operation === 'record') { service.recordResult.mockReturnValue(write); component().openResult(EXECUTION, EXECUTION.items[0]); component().saveResult(); }
    if (operation === 'complete') { service.complete.mockReturnValue(write); component().completeExecution(EXECUTION); }
    service.listExecutions.mockReturnValue(of([{ ...EXECUTION, rmaId: 5, templateName: 'Protocolo de B' }]));
    fixture.componentRef.setInput('rmaId', 5); render();
    write.next({ ...EXECUTION, templateName: 'Resposta de A' }); render();
    expect(text()).toContain('Protocolo de B'); expect(text()).not.toContain('Resposta de A');
    write.error({ error: { message: 'Erro de A' } }); render(); expect(text()).not.toContain('Erro de A');
  });

  // Vermelho: a escrita de A mantém as ações de B desabilitadas; seu finalize também pode liberar a escrita de B.
  it.each(['start', 'record', 'complete'] as const)('does not carry a pending %s write into another RMA', async (operation) => {
    await setup(); const first = new Subject<ProtocolExecutionResponse>();
    if (operation === 'start') { service.startExecution.mockReturnValue(first); component().selectTemplate(2); component().startExecution(); }
    if (operation === 'record') { service.recordResult.mockReturnValue(first); component().openResult(EXECUTION, EXECUTION.items[0]); component().saveResult(); }
    if (operation === 'complete') { service.complete.mockReturnValue(first); component().completeExecution(EXECUTION); }
    const current = { ...EXECUTION, rmaId: 5, templateName: 'Protocolo de B' };
    service.listExecutions.mockReturnValue(of([current])); fixture.componentRef.setInput('rmaId', 5); render();
    expect(button('Concluir protocolo')?.disabled).toBe(false);
    const second = new Subject<ProtocolExecutionResponse>(); service.recordResult.mockReturnValue(second);
    component().openResult(current, current.items[0]); component().saveResult(); render();
    expect(button('Salvar resultado')?.disabled).toBe(true);
    first.complete(); render();
    expect(button('Salvar resultado')?.disabled).toBe(true); expect(button('Cancelar')?.disabled).toBe(true);
    second.error({ error: { message: 'Revisar resultado de B.' } }); render();
    expect(button('Salvar resultado')?.disabled).toBe(false); expect(text()).toContain('Revisar resultado de B.');
  });

  it.each(['ADMIN', 'TECHNICIAN', 'SERVICE_DESK', 'VIEWER'] as LegacyProfileCode[])('preserves catalog permission for %s', async (role) => {
    await setup({ role }); expect(service.listTemplates).toHaveBeenCalledTimes(['ADMIN', 'TECHNICIAN'].includes(role) ? 1 : 0);
    expect(text()).toContain('Bancada PWM · v3');
  });

  it('preserves active options, pinned versions, the start payload and write errors', async () => {
    await setup({ templates: of([TEMPLATE, { ...TEMPLATE, id: 3, active: false }]) });
    component().selectTemplate(2); service.startExecution.mockReturnValue(throwError(() => ({ error: { message: 'Produto não aplicável.' } })));
    component().startExecution(); render();
    expect(service.startExecution).toHaveBeenCalledWith(4, 2); expect(text()).toContain('Produto não aplicável.'); expect(text()).toContain('Bancada PWM · v3');
    service.complete.mockReturnValue(throwError(() => ({ error: { message: 'Obrigatórios sem registro.' } })));
    component().completeExecution(EXECUTION); render(); expect(text()).toContain('Obrigatórios sem registro.'); expect(text()).toContain('Bancada PWM · v3');
  });

  it('shows legitimate empty executions only after a successful reading', async () => {
    await setup({ role: 'VIEWER', executions: of([]) }); expect(text()).toContain('Nenhum protocolo executado neste RMA.');
  });

  // Vermelho: leituras continuam inscritas depois de destruir o painel.
  it('cancels pending reads on destroy', async () => {
    const executions = new Subject<ProtocolExecutionResponse[]>(); const templates = new Subject<ProtocolTemplateResponse[]>();
    await setup({ executions, templates }); fixture.destroy();
    expect(executions.observed).toBe(false); expect(templates.observed).toBe(false);
  });
});

function expectPending(root: HTMLElement): void {
  const busy = root.querySelector('[aria-busy="true"]');
  expect(busy?.textContent?.trim()).toBe('');
  expect(busy?.children.length).toBe(0);
  expect(busy?.hasAttribute('role')).toBe(false);
  expect(root.textContent).not.toMatch(/Carregando(?! opções)|Atualizando (estoque|notificações|preferências|regras|falhas)/);
}
