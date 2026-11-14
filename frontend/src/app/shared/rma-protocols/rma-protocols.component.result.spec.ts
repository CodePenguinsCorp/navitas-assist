import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { ProtocolExecutionItemResponse, ProtocolExecutionResponse, ProtocolItemOutcome, ProtocolItemResultResponse, ProtocolItemType } from '../../core/models';
import { Permission } from '../../core/permissions';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { ProtocolService } from '../../core/services/protocol.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { RmaProtocolsComponent } from './rma-protocols.component';

const RESULT: ProtocolItemResultResponse = { id: 30, attempt: 1, outcome: 'PASSED', measuredValue: '12.50', unit: 'V', textValue: null,
  evidence: 'Foto original', justification: null, executedBy: 'ana', startedAt: '2026-10-20T12:00:00Z', completedAt: '2026-10-20T12:05:00Z' };
const ITEM: ProtocolExecutionItemResponse = {
  item: { id: 21, sortOrder: 1, stepName: 'Medições', title: 'Tensão', instructions: 'Medir na placa.', type: 'MEASUREMENT', required: true,
    unit: 'V', decimalPlaces: 2, minValue: 11.5, maxValue: 12.5, expectedResult: '12 V', evidenceRequired: true }, latest: null, attempts: []
};
const EXECUTION: ProtocolExecutionResponse = {
  id: 9, rmaId: 4, rmaCode: 'OS-4', templateId: 2, templateName: 'Bancada PWM', versionNumber: 3, status: 'IN_PROGRESS',
  blockedStatuses: [], startedBy: 'tech', startedAt: '2026-10-20T12:00:00Z', completedBy: null, completedAt: null,
  totalItems: 2, completedItems: 0, requiredItems: 1, pendingRequiredItems: 1, failedItems: 0,
  items: [ITEM, { ...ITEM, item: { ...ITEM.item, id: 22, title: 'Conector', type: 'CHECK', required: false }, latest: RESULT, attempts: [RESULT] }]
};
type Harness = { resultForm: FormGroup; openResult(execution: ProtocolExecutionResponse, item: ProtocolExecutionItemResponse): void;
  cancelResult(): void; saveResult(): void; selectTemplate(id: number | null): void; startExecution(): void; completeExecution(execution: ProtocolExecutionResponse): void };

describe('RmaProtocolsComponent result entry', () => {
  let fixture: ComponentFixture<RmaProtocolsComponent>;
  let service: { recordResult: ReturnType<typeof vi.fn>; startExecution: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn> };
  const component = () => fixture.componentInstance as unknown as Harness;
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const form = () => fixture.nativeElement.querySelector('form') as HTMLFormElement | null;
  const button = (label: string) => Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  const label = (name: string) => form()!.querySelector(`[formcontrolname="${name}"]`)!.closest('label')!;
  const set = (outcome: ProtocolItemOutcome) => { component().resultForm.patchValue({ outcome }); render(); };
  async function setup(role: LegacyProfileCode | readonly Permission[] = 'TECHNICIAN', item = ITEM) {
    service = { recordResult: vi.fn(() => of({ ...EXECUTION, items: [{ ...item, latest: RESULT, attempts: [RESULT] }] })), startExecution: vi.fn(() => of(EXECUTION)), complete: vi.fn(() => of(EXECUTION)) };
    await TestBed.configureTestingModule({ imports: [RmaProtocolsComponent], providers: [
      providePermissions(typeof role === 'string' ? profilePermissions(role) : role),
      { provide: ProtocolService, useValue: { ...service, listExecutions: () => of([{ ...EXECUTION, items: [item, EXECUTION.items[1]] }]),
        listTemplates: () => of([{ id: 2, name: 'Bancada PWM', active: true, currentVersion: 4, productId: null, productName: null,
          category: 'Placas', blockedStatuses: [], items: [], updatedAt: '2026-10-20T12:00:00Z' }]) } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(RmaProtocolsComponent); fixture.componentRef.setInput('rmaId', 4); render();
  }
  const open = (item = ITEM) => { component().openResult(EXECUTION, item); render(); };

  // Vermelho: o primeiro FAILED/NOT_APPLICABLE não sinaliza justificativa obrigatória.
  it.each(['FAILED', 'NOT_APPLICABLE'] as ProtocolItemOutcome[])('signals justification for a first %s result', async (outcome) => {
    await setup(); open(); set(outcome);
    expect(label('justification').textContent).toContain('Justificativa obrigatória');
    expect(form()!.querySelector('[formcontrolname="justification"]')?.getAttribute('aria-required')).toBe('true');
  });

  // Vermelho: o rótulo antigo usa asterisco fixo, sem explicar a condição do resultado atual.
  it.each(['PASSED', 'FAILED', 'NOT_APPLICABLE'] as ProtocolItemOutcome[])('signals evidence only when required for %s', async (outcome) => {
    await setup(); open(); component().resultForm.patchValue({ evidence: 'Rascunho da foto' }); set(outcome);
    expect(label('evidence').textContent).toContain(outcome === 'PASSED' ? 'Evidência obrigatória' : 'Evidência (opcional)');
    const evidence = form()!.querySelector<HTMLInputElement>('[formcontrolname="evidence"]')!;
    expect(evidence.getAttribute('aria-required')).toBe(String(outcome === 'PASSED')); expect(evidence.value).toBe('Rascunho da foto'); expect(evidence.required).toBe(false);
  });

  // Vermelho: a repetição não possui a regra expressa em texto e aria-required.
  it('signals justification on a repeated passed result', async () => {
    const repeated = { ...ITEM, latest: RESULT, attempts: [RESULT] }; await setup('ADMIN', repeated); open(repeated);
    expect(label('justification').textContent).toContain('Justificativa obrigatória');
    expect(form()!.querySelector('[formcontrolname="justification"]')?.getAttribute('aria-required')).toBe('true');
  });

  // Vermelho: o erro do servidor fica fora do formulário que contém os valores recusados.
  it.each(['Informe a evidência.', 'Informe a justificativa.', 'Use até 2 casas decimais.', 'Medição fora da faixa.', 'Informe o texto.'])('keeps result errors in the form and retries: %s', async (serverMessage) => {
    await setup(); open();
    component().resultForm.patchValue({ outcome: 'FAILED', measuredValue: '12,50', textValue: 'Registro local', evidence: 'Foto nova', justification: 'Após ajuste' });
    const updated = { ...EXECUTION, completedItems: 1, items: [{ ...ITEM, latest: { ...RESULT, id: 31, attempt: 2, evidence: 'Foto nova' }, attempts: [RESULT, { ...RESULT, id: 31, attempt: 2, evidence: 'Foto nova' }] }] };
    service.recordResult.mockReturnValueOnce(throwError(() => ({ error: { message: serverMessage } }))).mockReturnValue(of(updated));
    component().saveResult(); render();
    expect(form()?.querySelector('[role="alert"]')?.textContent ?? '').toContain(serverMessage);
    expect(component().resultForm.getRawValue()).toEqual({ outcome: 'FAILED', measuredValue: '12,50', textValue: 'Registro local', evidence: 'Foto nova', justification: 'Após ajuste' });
    expect(button('Cancelar')?.disabled).toBe(false);
    component().saveResult(); render(); expect(form()).toBeNull();
    (fixture.nativeElement.querySelector('.protocol-row__toggle') as HTMLButtonElement).click(); render();
    expect(fixture.nativeElement.textContent).toContain('Foto original'); expect(fixture.nativeElement.textContent).toContain('Foto nova');
    expect(service.recordResult).toHaveBeenCalledTimes(2);
  });

  // Vermelho: Cancelar fica habilitado e a reentrada direta permite descartar/duplicar a gravação.
  it('does not discard or submit a result twice while saving', async () => {
    await setup(); open(); component().selectTemplate(2);
    const write = new Subject<ProtocolExecutionResponse>(); service.recordResult.mockReturnValue(write);
    component().resultForm.patchValue({ measuredValue: '12,50', evidence: 'Foto pendente' }); component().saveResult(); render();
    expect(button('Cancelar')?.disabled).toBe(true); expect(button('Salvar resultado')?.disabled).toBe(true);
    component().cancelResult(); component().saveResult(); component().openResult(EXECUTION, EXECUTION.items[1]); component().startExecution(); component().completeExecution(EXECUTION); render();
    expect(form()).not.toBeNull(); expect(component().resultForm.controls['evidence'].value).toBe('Foto pendente');
    expect(service.recordResult).toHaveBeenCalledTimes(1); expect(service.startExecution).not.toHaveBeenCalled(); expect(service.complete).not.toHaveBeenCalled();
    write.error({ error: { message: 'Revisar evidência.' } }); render(); expect(button('Cancelar')?.disabled).toBe(false);
    button('Cancelar')!.click(); render(); expect(form()).toBeNull(); expect(fixture.nativeElement.textContent).not.toContain('Revisar evidência.');
  });

  // Vermelho: os métodos de iniciar/concluir aceitam reentrada enquanto a operação está pendente.
  it.each(['start', 'complete'] as const)('does not repeat or open an editor during pending %s', async (operation) => {
    await setup(); const write = new Subject<ProtocolExecutionResponse>(); component().selectTemplate(2);
    if (operation === 'start') service.startExecution.mockReturnValue(write); else service.complete.mockReturnValue(write);
    const act = () => operation === 'start' ? component().startExecution() : component().completeExecution(EXECUTION);
    act(); render(); act(); component().openResult(EXECUTION, ITEM); render();
    expect(operation === 'start' ? service.startExecution : service.complete).toHaveBeenCalledTimes(1);
    expect(form()).toBeNull(); write.error(new Error()); render();
    component().openResult(EXECUTION, ITEM); render(); expect(form()).not.toBeNull();
  });

  // Vermelho: as ações atuais dizem somente Iniciar/Registrar/Repetir/Concluir.
  it('uses explicit execution action labels and a named result section', async () => {
    await setup();
    for (const expected of ['Iniciar protocolo', 'Registrar resultado', 'Repetir registro', 'Concluir protocolo']) expect(button(expected)?.textContent?.trim() ?? '').toBe(expected);
    open(); expect(form()?.querySelector('fieldset legend')?.textContent).toBe('Resultado de Tensão'); expectCancelBeforePrimary(fixture.nativeElement);
  });

  it.each(['ADMIN', 'TECHNICIAN', 'SERVICE_DESK', 'VIEWER'] as LegacyProfileCode[])('preserves execution permission for %s', async (role) => {
    await setup(role);
    const writable = ['ADMIN', 'TECHNICIAN'].includes(role);
    const actions = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).filter((b) => /Registrar|Repetir|Concluir|Iniciar/.test(b.textContent ?? ''));
    expect(actions.length > 0).toBe(writable); expect(fixture.nativeElement.textContent).toContain('Bancada PWM · v3');
  });

  it.each([
    { permissions: ['rma.ver', 'protocolos.ver', 'protocolos.executar'] as Permission[], writable: true },
    { permissions: profilePermissions('ADMIN').filter((permission) => permission !== 'protocolos.executar'), writable: false }
  ])('follows protocolos.executar alone (writable=$writable)', async ({ permissions, writable }) => {
    await setup(permissions);
    const actions = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).filter((b) => /Registrar|Repetir|Concluir|Iniciar/.test(b.textContent ?? ''));
    expect(actions.length > 0).toBe(writable);
  });

  it.each(['MEASUREMENT', 'TEXT', 'CHECK'] as ProtocolItemType[])('preserves the %s payload and existing text limits', async (type) => {
    const item = { ...ITEM, item: { ...ITEM.item, type, evidenceRequired: false } }; await setup('TECHNICIAN', item); open(item);
    component().resultForm.patchValue({ measuredValue: ' 12,50 ', textValue: type === 'TEXT' ? ' Texto\n completo ' : ' ', evidence: ' ', justification: ' ' });
    expect(label('evidence').textContent).not.toContain('*');
    expect(label('justification').textContent).not.toContain('*');
    component().saveResult();
    expect(service.recordResult).toHaveBeenCalledWith(9, 21, { outcome: 'PASSED', measuredValue: type === 'MEASUREMENT' ? '12.50' : null,
      textValue: type === 'TEXT' ? 'Texto\n completo' : null, evidence: null, justification: null, startedAt: null });
    for (const [name, limit] of [['textValue', 1000], ['evidence', 500], ['justification', 500]] as const) {
      component().resultForm.controls[name].setValue('x'.repeat(limit + 1)); expect(component().resultForm.controls[name].hasError('maxlength')).toBe(true);
    }
  });
});
