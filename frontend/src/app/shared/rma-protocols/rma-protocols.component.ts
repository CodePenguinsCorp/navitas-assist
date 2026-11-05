import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ProtocolExecutionItemResponse, ProtocolExecutionResponse, ProtocolItemOutcome, ProtocolTemplateResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { extractHttpErrorMessage, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import {
  PROTOCOL_EXECUTION_STATUS_LABELS,
  PROTOCOL_OUTCOME_LABELS,
  normalizeDecimal,
  protocolOutcomeClass,
  protocolProgressLabel,
  protocolProgressPercent
} from '../../core/utils/protocol-ui';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';

interface EditingItem {
  executionId: number;
  item: ProtocolExecutionItemResponse;
}

@Component({
  selector: 'app-rma-protocols',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './rma-protocols.component.html',
  styles: [`
    :host {
      display: block;
    }

    .protocol-execution {
      display: grid;
      gap: 0.6rem;
      margin-top: 0.75rem;
      padding: 0.8rem;
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    .protocol-progress {
      height: 6px;
      border-radius: 999px;
      background: #eef2f6;
      overflow: hidden;
    }

    .protocol-progress span {
      display: block;
      height: 100%;
      background: var(--brand-blue-deep);
    }

    .protocol-item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .protocol-item p {
      margin: 0.15rem 0 0;
      color: var(--muted);
      font-size: 0.85rem;
    }

    .protocol-start {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-top: 0.75rem;
    }
  `]
})
export class RmaProtocolsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly protocolService = inject(ProtocolService);
  private readonly authService = inject(AuthService);

  readonly rmaId = input.required<number>();

  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly executions = signal<ProtocolExecutionResponse[]>([]);
  protected readonly selectedTemplateId = signal<number | null>(null);
  protected readonly editing = signal<EditingItem | null>(null);
  protected readonly canExecute = computed(() => this.authService.hasAnyRole(['ADMIN', 'TECHNICIAN']));

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
    effect(() => this.loadExecutions(this.rmaId()));
    if (this.canExecute()) {
      this.protocolService.listTemplates().subscribe({ next: (templates) => this.templatesSignal.set(templates) });
    }
  }

  protected selectTemplate(value: number | null): void {
    this.selectedTemplateId.set(value);
  }

  protected startExecution(): void {
    const templateId = this.selectedTemplateId();
    if (templateId === null) {
      this.errorMessage.set('Selecione o protocolo a executar.');
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');
    this.protocolService.startExecution(this.rmaId(), templateId).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (execution) => this.executions.update((executions) => [...executions, execution]),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível iniciar o protocolo.'))
    });
  }

  protected openResult(execution: ProtocolExecutionResponse, item: ProtocolExecutionItemResponse): void {
    this.editing.set({ executionId: execution.id, item });
    this.resultForm.reset({ outcome: 'PASSED', measuredValue: '', textValue: '', evidence: '', justification: '' });
    this.errorMessage.set('');
  }

  protected cancelResult(): void {
    this.editing.set(null);
  }

  protected saveResult(): void {
    const editing = this.editing();
    if (!editing) {
      return;
    }

    const raw = this.resultForm.getRawValue();
    this.submitting.set(true);
    this.errorMessage.set('');
    this.protocolService.recordResult(editing.executionId, editing.item.item.id, {
      outcome: raw.outcome,
      measuredValue: editing.item.item.type === 'MEASUREMENT' ? normalizeDecimal(raw.measuredValue) : null,
      textValue: normalizeOptionalText(raw.textValue),
      evidence: normalizeOptionalText(raw.evidence),
      justification: normalizeOptionalText(raw.justification),
      startedAt: null
    }).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (execution) => {
        this.replaceExecution(execution);
        this.editing.set(null);
      },
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível registrar o resultado.'))
    });
  }

  protected completeExecution(execution: ProtocolExecutionResponse): void {
    this.submitting.set(true);
    this.errorMessage.set('');
    this.protocolService.complete(execution.id).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (updated) => this.replaceExecution(updated),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível concluir o protocolo.'))
    });
  }

  protected isEditing(execution: ProtocolExecutionResponse, item: ProtocolExecutionItemResponse): boolean {
    const editing = this.editing();
    return editing !== null && editing.executionId === execution.id && editing.item.item.id === item.item.id;
  }

  protected progressLabel(execution: ProtocolExecutionResponse): string {
    return protocolProgressLabel(execution);
  }

  protected progressPercent(execution: ProtocolExecutionResponse): number {
    return protocolProgressPercent(execution);
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
      return item.item.expectedResult ?? '';
    }
    const value = latest.measuredValue ? `${latest.measuredValue} ${latest.unit ?? ''}`.trim() : latest.textValue ?? '';
    const attempts = item.attempts.length > 1 ? ` · tentativa ${latest.attempt}` : '';
    return `${value ? value + ' · ' : ''}${latest.executedBy} em ${formatBusinessDateTime(latest.completedAt)}${attempts}`;
  }

  private replaceExecution(execution: ProtocolExecutionResponse): void {
    this.executions.update((executions) => executions.map((current) => current.id === execution.id ? execution : current));
  }

  private loadExecutions(rmaId: number): void {
    this.loading.set(true);
    this.protocolService.listExecutions(rmaId).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (executions) => this.executions.set(executions),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os protocolos do RMA.'))
    });
  }
}
