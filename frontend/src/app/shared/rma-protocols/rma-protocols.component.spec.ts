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
  id: 9, rmaId: 4, rmaCode: 'RMA-2026-000004', templateId: 2, templateName: 'Bancada PWM', versionNumber: 3, status: 'IN_PROGRESS',
  blockedStatuses: ['IN_TESTS'], startedBy: 'tech', startedAt: '2026-10-20T12:00:00Z', completedBy: null, completedAt: null,
  totalItems: 2, completedItems: 1, requiredItems: 2, pendingRequiredItems: 1, failedItems: 0, items: [MEASUREMENT]
};

describe('RmaProtocolsComponent', () => {
  let fixture: ComponentFixture<RmaProtocolsComponent>;
  let component: RmaProtocolsHarness;
  let role: LegacyProfileCode;
  let results: ProtocolItemResultRequest[];

  async function setup(currentRole: LegacyProfileCode): Promise<void> {
    role = currentRole;
    results = [];
    await TestBed.configureTestingModule({
      imports: [RmaProtocolsComponent],
      providers: [
        providePermissions(profilePermissions(role)),
        { provide: ProtocolService, useValue: {
          listExecutions: () => of([EXECUTION]),
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

  it('shows protocol, version and progress without execution actions for viewers', async () => {
    await setup('VIEWER');

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Bancada PWM · v3');
    expect(text).toContain('1/2 registrados');
    expect(text).toContain('1/2 obrigatórios');
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
