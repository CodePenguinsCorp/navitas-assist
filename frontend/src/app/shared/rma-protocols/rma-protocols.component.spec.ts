import { Signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { ProtocolExecutionItemResponse, ProtocolExecutionResponse, ProtocolItemResultRequest } from '../../core/models';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { ProtocolService } from '../../core/services/protocol.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { RmaProtocolsComponent } from './rma-protocols.component';

const MEASUREMENT: ProtocolExecutionItemResponse = {
  item: { id: 21, sortOrder: 1, stepName: 'Medições', title: 'Tensão', instructions: null, type: 'MEASUREMENT', required: true, unit: 'V',
    decimalPlaces: 2, minValue: 11.5, maxValue: 12.5, expectedResult: 'Entre 11,50 V e 12,50 V', evidenceRequired: false },
  latest: null,
  attempts: []
};

const EXECUTION: ProtocolExecutionResponse = {
  id: 9, rmaId: 4, rmaCode: 'OS-2026-000004', templateId: 2, templateName: 'Bancada PWM', versionNumber: 3, status: 'IN_PROGRESS',
  blockedStatuses: ['IN_TESTS'], startedBy: 'tech', startedAt: '2026-10-20T12:00:00Z', completedBy: null, completedAt: null,
  totalItems: 2, completedItems: 1, requiredItems: 2, pendingRequiredItems: 1, failedItems: 0, items: [MEASUREMENT]
};

describe('RmaProtocolsComponent', () => {
  let fixture: ComponentFixture<RmaProtocolsComponent>;
  let component: RmaProtocolsHarness;
  let role: LegacyProfileCode;
  let results: ProtocolItemResultRequest[];

  async function setup(currentRole: LegacyProfileCode, executions = [EXECUTION]): Promise<void> {
    localStorage.clear();
    role = currentRole;
    results = [];
    await TestBed.configureTestingModule({
      imports: [RmaProtocolsComponent],
      providers: [
        providePermissions(profilePermissions(role)),
        { provide: ProtocolService, useValue: {
          listExecutions: () => of(executions),
          listTemplates: () => of([]),
          recordResult: (_executionId: number, _itemId: number, payload: ProtocolItemResultRequest) => {
            results.push(payload);
            return of({ ...EXECUTION, completedItems: 2, pendingRequiredItems: 0 });
          }
        } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RmaProtocolsComponent);
    fixture.componentRef.setInput('rmaId', 4);
    component = fixture.componentInstance as unknown as RmaProtocolsHarness;
    fixture.detectChanges();
  }

  it('agrupa os itens em uma regi?o identificada dentro da execução', async () => {
    await setup('TECHNICIAN');
    const group = fixture.nativeElement.querySelector('.protocol-execution section[aria-label="Medições"]');
    expect(group).not.toBeNull();
    expect(group.querySelector('.protocol-row').textContent).toContain('Registrar resultado');
    expect(group.querySelector('.protocol-row').textContent).toContain('Obrigatório');
  });

  it('folds an empty protocol section and unfolds the launcher from its header action', async () => {
    await setup('TECHNICIAN', []);
    const host = fixture.nativeElement as HTMLElement;
    const toggle = host.querySelector<HTMLButtonElement>('.collapsible__toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const action = host.querySelector<HTMLButtonElement>('.collapsible__actions button')!;
    expect(action.textContent).toContain('Executar protocolo');
    expect(host.querySelector('.protocol-launch')).toBeNull();
    action.click(); fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.protocol-launch')).not.toBeNull();
    toggle.click(); fixture.detectChanges();
    expect(host.querySelector<HTMLElement>('.collapsible__body')!.hidden).toBe(true);
  });

  it('hides the empty text while the launcher is open, using the inline form pattern', async () => {
    await setup('TECHNICIAN', []);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Nenhum protocolo executado nesta OS.');
    host.querySelector<HTMLButtonElement>('.collapsible__actions button')!.click(); fixture.detectChanges();
    expect(host.textContent).not.toContain('Nenhum protocolo executado nesta OS.');
    expect(host.querySelector('.protocol-launch.inline-form')).not.toBeNull();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.protocol-launch .inline-form__actions button')].map((b) => b.textContent?.trim());
    expect(buttons).toEqual(['Cancelar', 'Iniciar protocolo']);
    host.querySelector<HTMLButtonElement>('.protocol-launch .button-secondary')!.click(); fixture.detectChanges();
    expect(host.querySelector('.protocol-launch')).toBeNull();
    expect(host.textContent).toContain('Nenhum protocolo executado nesta OS.');
  });

  it('shows protocol, version and progress without execution actions for viewers', async () => {
    await setup('VIEWER');

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Bancada PWM - v3');
    expect(text).toContain('1/2');
    expect(text).not.toContain('Registrar');
  });

  it('sends measurements as decimal text and refreshes progress', async () => {
    await setup('TECHNICIAN');

    component.openResult(EXECUTION, MEASUREMENT);
    component.resultForm.patchValue({ measuredValue: '12,50' });
    component.saveResult();

    expect(results).toEqual([expect.objectContaining({ outcome: 'PASSED', measuredValue: '12.50', textValue: null })]);
    expect(component.executions()[0].pendingRequiredItems).toBe(0);
  });

  it('shows Cancelar before the primary action in the form dialog', async () => {
    await setup('TECHNICIAN');
    component.openResult(EXECUTION, MEASUREMENT);
    fixture.detectChanges();

    expectCancelBeforePrimary(fixture.nativeElement);
  });
});

type RmaProtocolsHarness = {
  resultForm: FormGroup;
  executions: Signal<ProtocolExecutionResponse[]>;
  openResult(execution: ProtocolExecutionResponse, item: ProtocolExecutionItemResponse): void;
  saveResult(): void;
};
