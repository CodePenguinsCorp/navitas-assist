import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ChecklistTemplate,
  UserRole,
  WorkflowDefinition,
  WorkflowTransitionDefinition,
  WorkflowCondition,
  WorkflowAction,
} from '../../core/models';
import { CustomSelectComponent } from '../../shared/form-controls/custom-select/custom-select.component';
@Component({
  selector: 'app-workflow-transitions',
  imports: [FormsModule, CustomSelectComponent],
  templateUrl: './workflow-transitions.component.html',
  styleUrl: './workflow-transitions.component.css',
})
export class WorkflowTransitionsComponent {
  readonly definition = input.required<WorkflowDefinition>();
  readonly templates = input<ChecklistTemplate[]>([]);
  readonly source = input('');
  readonly sourceChange = output<string>();
  readonly changed = output<void>();
  readonly roles: UserRole[] = ['ADMIN', 'SERVICE_DESK', 'TECHNICIAN'];
  readonly fields = [
    'invoiceNumber',
    'reportedFailure',
    'receivedAccessories',
    'physicalCondition',
    'repairSummary',
    'replacedPartsSummary',
    'testSummary',
    'assigneeId',
    'diagnosis.foundFailure',
    'diagnosis.technicianName',
    'trackingCode',
    'carrier',
    'shippedAt',
    'purchaseDate',
    'priority',
  ];
  readonly fieldNames: Record<string, string> = {
    invoiceNumber: 'Nota fiscal',
    reportedFailure: 'Falha relatada',
    receivedAccessories: 'Acessórios',
    physicalCondition: 'Condição física',
    repairSummary: 'Resumo do reparo',
    replacedPartsSummary: 'Peças substituídas',
    testSummary: 'Resumo dos testes',
    assigneeId: 'Responsável',
    'diagnosis.foundFailure': 'Falha encontrada',
    'diagnosis.technicianName': 'Técnico do diagnóstico',
    trackingCode: 'Rastreamento',
    carrier: 'Transportadora',
    shippedAt: 'Data de envio',
    purchaseDate: 'Data da compra',
    priority: 'Prioridade',
  };
  readonly conditionTypes = [
    { value: 'FIELD', label: 'Campo do RMA' },
    { value: 'CHECKLIST', label: 'Checklist concluído' },
    { value: 'APPROVAL', label: 'Aprovação interna' },
    { value: 'RELATED_STATUS', label: 'Status do RMA relacionado' },
  ];
  readonly operators = [
    { value: 'PRESENT', label: 'Preenchido' },
    { value: 'EQUALS', label: 'Igual a' },
    { value: 'NOT_EQUALS', label: 'Diferente de' },
  ];
  readonly booleanOperators = this.operators.slice(1);
  readonly booleans = [
    { value: 'true', label: 'Sim' },
    { value: 'false', label: 'Não' },
  ];
  readonly actionTypes = [
    { value: 'ADD_NOTE', label: 'Adicionar nota' },
    { value: 'SET_PRIORITY', label: 'Definir prioridade' },
    { value: 'CLEAR_ASSIGNEE', label: 'Remover responsável' },
  ];
  readonly priorities = [
    { value: 'HIGH', label: 'Alta' },
    { value: 'MEDIUM', label: 'Média' },
    { value: 'LOW', label: 'Baixa' },
  ];
  statuses() {
    return this.definition().statuses.map((s) => ({ value: s.code, label: s.label }));
  }
  destinations() {
    return this.definition()
      .statuses.filter((s) => s.active && s.code !== this.source())
      .map((s) => ({ value: s.code, label: s.label }));
  }
  outgoing() {
    return this.definition().transitions.filter((t) => t.from === this.source());
  }
  graphHeight() {
    return Math.max(220, this.outgoing().length * 40 + 40);
  }
  graphLabel(code: string) {
    const label = this.label(code);
    return label.length > 30 ? label.slice(0, 29) + '…' : label;
  }
  label(code: string) {
    return this.definition().statuses.find((s) => s.code === code)?.label ?? code;
  }
  add() {
    const to = this.destinations().find((s) => !this.outgoing().some((t) => t.to === s.value))?.value;
    if (!to) return;
    this.definition().transitions.push({
      from: this.source(),
      to,
      roles: ['ADMIN', 'SERVICE_DESK', 'TECHNICIAN'],
      requiredFields: [],
      conditions: [],
      actions: [],
    });
    this.changed.emit();
  }
  remove(t: WorkflowTransitionDefinition) {
    this.definition().transitions.splice(this.definition().transitions.indexOf(t), 1);
    this.changed.emit();
  }
  toggle<T>(values: T[], value: T) {
    const index = values.indexOf(value);
    if (index < 0) values.push(value);
    else values.splice(index, 1);
    this.changed.emit();
  }
  addCondition(t: WorkflowTransitionDefinition) {
    t.conditions.push({ type: 'FIELD', field: 'invoiceNumber', operator: 'PRESENT', value: null });
    this.changed.emit();
  }
  conditionType(c: WorkflowCondition) {
    c.field = c.type === 'FIELD' ? 'invoiceNumber' : c.type === 'CHECKLIST' ? (this.templates()[0]?.code ?? '') : null;
    c.operator = c.type === 'FIELD' ? 'PRESENT' : 'EQUALS';
    c.value = c.type === 'CHECKLIST' || c.type === 'APPROVAL' ? 'true' : null;
    this.changed.emit();
  }
  checklistOptions() {
    return this.templates().map((t) => ({ value: t.code, label: t.name + (t.active ? '' : ' (arquivado)') }));
  }
  fieldOptions() {
    return this.fields.map((value) => ({ value, label: this.fieldNames[value] }));
  }
  actionType(a: WorkflowAction) {
    a.value = a.type === 'SET_PRIORITY' ? 'MEDIUM' : a.type === 'ADD_NOTE' ? '' : null;
    this.changed.emit();
  }
}
