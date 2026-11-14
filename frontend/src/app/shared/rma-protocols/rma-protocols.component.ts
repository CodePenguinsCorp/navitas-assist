import { IconComponent } from '../icon/icon.component';
import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { ProtocolExecutionItemResponse, ProtocolExecutionResponse, ProtocolItemOutcome, ProtocolItemResultResponse, ProtocolTemplateResponse } from '../../core/models';
import { PermissionService } from '../../core/services/permission.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { extractHttpErrorMessage, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import {
  PROTOCOL_EXECUTION_STATUS_LABELS,
  PROTOCOL_OUTCOME_LABELS,
  normalizeDecimal,
  protocolOutcomeClass,
  protocolProgressPercent
} from '../../core/utils/protocol-ui';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';

interface ItemRow { item: ProtocolExecutionItemResponse; number: number; }
interface StepGroup { key: string; step: string; rows: ItemRow[]; }
interface ExecutionView { execution: ProtocolExecutionResponse; groups: StepGroup[]; }

interface EditingItem {
  executionId: number;
  item: ProtocolExecutionItemResponse;
}

@Component({
  selector: 'app-rma-protocols',
  imports: [IconComponent, ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './rma-protocols.component.html',
  styleUrl: './rma-protocols.component.css'
})
export class RmaProtocolsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly protocolService = inject(ProtocolService);
  private readonly permissions = inject(PermissionService);
  private readonly destroyRef = inject(DestroyRef);
  private loadRequest?: Subscription;
  private templatesRequest?: Subscription;
  private writeRequest?: Subscription;
  private loadedRmaId: number | null = null;

  readonly rmaId = input.required<number>();

  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly hasLoaded = signal(false);
  protected readonly loadErrorMessage = signal('');
  protected readonly templatesLoading = signal(false);
  protected readonly templatesLoadFailed = signal(false);
  protected readonly templatesLoadErrorMessage = signal('');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly resultErrorMessage = signal('');
  protected readonly executions = signal<ProtocolExecutionResponse[]>([]);
  protected readonly selectedTemplateId = signal<number | null>(null);
  protected readonly editing = signal<EditingItem | null>(null);
  protected readonly canExecute = computed(() => this.permissions.hasPermission('protocolos.executar'));

  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly views = computed<ExecutionView[]>(() => this.executions().map((execution) => ({ execution, groups: groupByStep(execution) })));

  private readonly templatesSignal = signal<ProtocolTemplateResponse[]>([]);

  protected readonly templateOptions = computed<ReadonlyArray<CustomSelectOption<number | null>>>(() =>
    this.templatesSignal().filter((template) => template.active).map((template) => ({ value: template.id, label: `${template.name} (v${template.currentVersion})` }))
  );
  protected readonly outcomeOptions: ReadonlyArray<CustomSelectOption<ProtocolItemOutcome>> = (Object.keys(PROTOCOL_OUTCOME_LABELS) as ProtocolItemOutcome[]).map((outcome) => ({ value: outcome, label: PROTOCOL_OUTCOME_LABELS[outcome] }));

  protected readonly resultForm = this.formBuilder.nonNullable.group({
    outcome: ['PASSED' as ProtocolItemOutcome, [Validators.required]],
    measuredValue: [''],
    textValue: ['', [Validators.maxLength(1000)]],
    evidence: ['', [Validators.maxLength(500)]],
    justification: ['', [Validators.maxLength(500)]]
  });

  constructor() {
    effect(() => { const id = this.rmaId(); untracked(() => this.loadExecutions(id)); });
    this.loadTemplates();
  }

  protected retryLoad(): void {
    if (!this.loading()) this.loadExecutions(this.rmaId());
  }

  protected retryTemplates(): void {
    if (!this.templatesLoading()) this.loadTemplates();
  }

  protected selectTemplate(value: number | null): void {
    if (this.submitting()) return;
    this.selectedTemplateId.set(value);
  }

  protected startExecution(): void {
    if (this.submitting()) return;
    const templateId = this.selectedTemplateId();
    if (templateId === null) {
      this.errorMessage.set('Selecione o protocolo a executar.');
      return;
    }

    const rmaId = this.rmaId();
    this.submitting.set(true);
    this.errorMessage.set('');
    this.writeRequest = this.protocolService.startExecution(rmaId, templateId).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.submitting.set(false))).subscribe({
      next: (execution) => { if (this.rmaId() === rmaId) this.executions.update((executions) => [...executions, execution]); },
      error: (error) => { if (this.rmaId() === rmaId) this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível iniciar o protocolo.')); }
    });
  }

  protected openResult(execution: ProtocolExecutionResponse, item: ProtocolExecutionItemResponse): void {
    if (this.submitting()) return;
    this.editing.set({ executionId: execution.id, item });
    this.resultForm.reset({ outcome: 'PASSED', measuredValue: '', textValue: '', evidence: '', justification: '' });
    this.errorMessage.set('');
    this.resultErrorMessage.set('');
  }

  protected cancelResult(): void {
    if (this.submitting()) return;
    this.editing.set(null);
    this.resultErrorMessage.set('');
  }

  protected requiresEvidence(): boolean {
    return this.editing()?.item.item.evidenceRequired === true && this.resultForm.controls.outcome.value === 'PASSED';
  }

  protected requiresJustification(): boolean {
    const editing = this.editing();
    return editing !== null && (editing.item.latest !== null || this.resultForm.controls.outcome.value !== 'PASSED');
  }

  protected saveResult(): void {
    if (this.submitting()) return;
    const editing = this.editing();
    if (!editing) {
      return;
    }

    const raw = this.resultForm.getRawValue();
    const rmaId = this.rmaId();
    this.submitting.set(true);
    this.resultErrorMessage.set('');
    this.writeRequest = this.protocolService.recordResult(editing.executionId, editing.item.item.id, {
      outcome: raw.outcome,
      measuredValue: editing.item.item.type === 'MEASUREMENT' ? normalizeDecimal(raw.measuredValue) : null,
      textValue: normalizeOptionalText(raw.textValue),
      evidence: normalizeOptionalText(raw.evidence),
      justification: normalizeOptionalText(raw.justification),
      startedAt: null
    }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.submitting.set(false))).subscribe({
      next: (execution) => {
        if (this.rmaId() !== rmaId) return;
        this.replaceExecution(execution);
        this.editing.set(null);
      },
      error: (error) => { if (this.rmaId() === rmaId) this.resultErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível registrar o resultado.')); }
    });
  }

  protected completeExecution(execution: ProtocolExecutionResponse): void {
    if (this.submitting()) return;
    const rmaId = this.rmaId();
    this.submitting.set(true);
    this.errorMessage.set('');
    this.writeRequest = this.protocolService.complete(execution.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.submitting.set(false))).subscribe({
      next: (updated) => { if (this.rmaId() === rmaId) this.replaceExecution(updated); },
      error: (error) => { if (this.rmaId() === rmaId) this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível concluir o protocolo.')); }
    });
  }

  protected isEditing(execution: ProtocolExecutionResponse, item: ProtocolExecutionItemResponse): boolean {
    const editing = this.editing();
    return editing !== null && editing.executionId === execution.id && editing.item.item.id === item.item.id;
  }

  protected summaryLabel(execution: ProtocolExecutionResponse): string {
    const registered = `${execution.completedItems}/${execution.totalItems} registrados`;
    return execution.requiredItems === 0 ? `Sem obrigatórios · ${registered}` : `${this.satisfiedRequiredItems(execution)}/${execution.requiredItems} obrigatórios · ${registered}`;
  }

  protected executionClass(execution: ProtocolExecutionResponse): string {
    return `mini-chip ${execution.status === 'COMPLETED' ? 'warranty-ok' : execution.status === 'FAILED' ? 'priority-high' : ''}`.trim();
  }

  protected rangeLabel(item: ProtocolExecutionItemResponse): string {
    const { type, minValue, maxValue, decimalPlaces, unit } = item.item;
    if (type !== 'MEASUREMENT' || (minValue === null && maxValue === null)) return '';
    const fmt = (value: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimalPlaces ?? 6 }).format(value);
    const suffix = unit ? ` ${unit}` : '';
    if (minValue !== null && maxValue !== null) return `${fmt(minValue)}–${fmt(maxValue)}${suffix}`;
    return minValue !== null ? `≥ ${fmt(minValue)}${suffix}` : `≤ ${fmt(maxValue as number)}${suffix}`;
  }

  protected hasDetails(item: ProtocolExecutionItemResponse): boolean {
    return !!item.item.expectedResult || !!item.item.instructions || item.attempts.length > 1;
  }

  protected detailsId(execution: ProtocolExecutionResponse, item: ProtocolExecutionItemResponse): string {
    return `protocol-details-${execution.id}-${item.item.id}`;
  }

  protected isExpanded(execution: ProtocolExecutionResponse, item: ProtocolExecutionItemResponse): boolean {
    return this.expanded().has(this.detailsId(execution, item));
  }

  protected toggleDetails(execution: ProtocolExecutionResponse, item: ProtocolExecutionItemResponse): void {
    const id = this.detailsId(execution, item);
    this.expanded.update((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  }

  protected progressPercent(execution: ProtocolExecutionResponse): number {
    return protocolProgressPercent(execution);
  }

  protected satisfiedRequiredItems(execution: ProtocolExecutionResponse): number {
    return Math.max(0, Math.min(execution.requiredItems, execution.requiredItems - execution.pendingRequiredItems));
  }

  protected readonly outcomeLabels = PROTOCOL_OUTCOME_LABELS;
  protected readonly dateTime = formatBusinessDateTime;

  protected resultValue(result: ProtocolItemResultResponse): string {
    return result.measuredValue !== null ? `${result.measuredValue} ${result.unit ?? ''}`.trim() : result.textValue ?? '';
  }

  protected statusLabel(execution: ProtocolExecutionResponse): string {
    return PROTOCOL_EXECUTION_STATUS_LABELS[execution.status];
  }

  protected outcomeLabel(item: ProtocolExecutionItemResponse): string {
    return item.latest ? PROTOCOL_OUTCOME_LABELS[item.latest.outcome] : 'Pendente';
  }

  protected outcomeClass(item: ProtocolExecutionItemResponse): string {
    return `mini-chip ${protocolOutcomeClass(item.latest?.outcome ?? null)}`;
  }

  protected resultSummary(item: ProtocolExecutionItemResponse): string {
    const latest = item.latest;
    if (!latest) {
      return '';
    }
    const value = this.resultValue(latest);
    const attempts = item.attempts.length > 1 ? ` · tentativa ${latest.attempt}` : '';
    return `${value ? value + ' · ' : ''}${latest.executedBy} em ${formatBusinessDateTime(latest.completedAt)}${attempts}`;
  }

  private replaceExecution(execution: ProtocolExecutionResponse): void {
    this.executions.update((executions) => executions.map((current) => current.id === execution.id ? execution : current));
  }

  private loadExecutions(rmaId: number): void {
    this.loadRequest?.unsubscribe();
    if (this.loadedRmaId !== rmaId) {
      this.writeRequest?.unsubscribe();
      this.loadedRmaId = rmaId;
      this.executions.set([]);
      this.editing.set(null);
      this.selectedTemplateId.set(null);
      this.errorMessage.set('');
      this.resultErrorMessage.set('');
      this.hasLoaded.set(false);
      this.loadFailed.set(false);
      this.loadErrorMessage.set('');
      this.resultForm.reset({ outcome: 'PASSED', measuredValue: '', textValue: '', evidence: '', justification: '' });
    }
    this.loading.set(true);
    this.loadRequest = this.protocolService.listExecutions(rmaId).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: (executions) => {
        if (this.rmaId() !== rmaId) return;
        this.executions.set(executions);
        this.hasLoaded.set(true);
        this.loadFailed.set(false);
        this.loadErrorMessage.set('');
      },
      error: (error) => {
        if (this.rmaId() !== rmaId) return;
        this.executions.set([]);
        this.loadFailed.set(true);
        this.loadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os protocolos do RMA.'));
      }
    });
  }

  private loadTemplates(): void {
    if (!this.canExecute()) return;
    this.templatesRequest?.unsubscribe();
    this.templatesLoading.set(true);
    this.templatesRequest = this.protocolService.listTemplates().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.templatesLoading.set(false))).subscribe({
      next: (templates) => {
        this.templatesSignal.set(templates);
        this.templatesLoadFailed.set(false);
        this.templatesLoadErrorMessage.set('');
      },
      error: (error) => {
        this.templatesSignal.set([]);
        this.selectedTemplateId.set(null);
        this.templatesLoadFailed.set(true);
        this.templatesLoadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as opções de protocolos.'));
      }
    });
  }
}

function groupByStep(execution: ProtocolExecutionResponse): StepGroup[] {
  const groups: StepGroup[] = [];
  execution.items.forEach((item, index) => {
    const last = groups[groups.length - 1];
    const row = { item, number: index + 1 };
    if (last && last.step === item.item.stepName) last.rows.push(row);
    else groups.push({ key: `${index}-${item.item.stepName}`, step: item.item.stepName, rows: [row] });
  });
  return groups;
}
