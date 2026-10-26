import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { catchError, finalize, from, map, mergeMap, of, toArray } from 'rxjs';
import { RMA_PRIORITY_LABELS, RMA_STATUS_FLOW, RMA_STATUS_LABELS } from '../../core/mock-data';
import { RmaPriority, RmaResponse, RmaStatus } from '../../core/models';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { wipErrorMessage } from '../../core/utils/wip-ui';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';

export type BulkAction = 'status' | 'priority' | 'assignee';
export interface BulkRmaResult {
  id: number;
  code: string;
  success: boolean;
  message: string;
  rma?: RmaResponse;
}

@Component({
  selector: 'app-kanban-bulk-actions',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './kanban-bulk-actions.component.html',
  styleUrl: './kanban-bulk-actions.component.css',
})
export class KanbanBulkActionsComponent {
  private readonly rmaService = inject(RmaService);
  private readonly formBuilder = inject(FormBuilder);
  readonly selection = input<readonly RmaResponse[]>([]);
  readonly hiddenCount = input(0);
  readonly visibleCount = input(0);
  readonly canUpdateStatus = input(false);
  readonly canManage = input(false);
  readonly canOverrideWip = input(false);
  readonly disabled = input(false);
  readonly assigneeOptions = input<ReadonlyArray<CustomSelectOption<number | null>>>([]);
  readonly selectVisible = output<void>();
  readonly clearSelection = output<void>();
  readonly busyChange = output<boolean>();
  readonly applied = output<BulkRmaResult[]>();

  protected readonly busy = signal(false);
  protected readonly action = signal<BulkAction | null>(null);
  protected readonly pending = signal<readonly RmaResponse[]>([]);
  protected readonly results = signal<BulkRmaResult[]>([]);
  protected readonly error = signal('');
  protected readonly successCount = computed(() => this.results().filter((item) => item.success).length);
  protected readonly form = this.formBuilder.group({
    status: ['TRIAGE' as RmaStatus], priority: ['MEDIUM' as RmaPriority], assigneeId: [null as number | null], note: [''], wipOverrideReason: [''],
  });
  private readonly values = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  protected readonly statusOptions = RMA_STATUS_FLOW.map((value) => ({ value, label: RMA_STATUS_LABELS[value] }));
  protected readonly priorityOptions = (['HIGH', 'MEDIUM', 'LOW'] as const).map((value) => ({ value, label: RMA_PRIORITY_LABELS[value] }));
  protected readonly summary = computed(() => {
    const values = this.values();
    if (this.action() === 'status') return values.status ? `Alterar status para ${RMA_STATUS_LABELS[values.status]}` : 'Selecione o novo status';
    if (this.action() === 'priority') return `Alterar prioridade para ${values.priority ? RMA_PRIORITY_LABELS[values.priority] : ''}`;
    return `Alterar responsável para ${this.assigneeOptions().find((option) => option.value === values.assigneeId)?.label ?? 'Sem responsável'}`;
  });

  protected open(action: BulkAction): void {
    if (this.disabled() || this.busy() || !this.selection().length || !this.allowed(action)) return;
    this.pending.set([...this.selection()]);
    this.form.reset({ status: null, priority: 'MEDIUM', assigneeId: null, note: '', wipOverrideReason: '' });
    this.error.set('');
    this.action.set(action);
  }

  protected close(): void {
    if (this.busy()) return;
    this.action.set(null);
    this.pending.set([]);
  }

  protected confirm(): void {
    const action = this.action();
    if (!action || this.busy() || this.disabled() || !this.pending().length || !this.allowed(action)) return;
    const values = this.form.getRawValue();
    if ((values.wipOverrideReason?.length ?? 0) > 200) { this.error.set('A justificativa de WIP deve ter até 200 caracteres.'); return; }
    if ((action === 'status' && (!values.status || !this.statusOptions.some((option) => option.value === values.status) || (values.note?.length ?? 0) > 255))
      || (action === 'priority' && !this.priorityOptions.some((option) => option.value === values.priority))
      || (action === 'assignee' && !this.assigneeOptions().some((option) => option.value === values.assigneeId))) {
      this.error.set('Confira os valores da operação antes de confirmar.');
      return;
    }
    const targets = this.pending();
    this.form.disable({ emitEvent: false });
    this.busy.set(true);
    this.busyChange.emit(true);
    this.results.set([]);
    this.error.set('');
    from(targets).pipe(
      mergeMap((rma) => {
        const request = action === 'status'
          ? this.rmaService.updateStatusInBulk(rma.id, { status: values.status!, note: values.note?.trim() || null, expectedStatus: rma.status, ...(this.canOverrideWip() && values.wipOverrideReason?.trim() ? { wipOverrideReason: values.wipOverrideReason.trim() } : {}) })
          : action === 'priority'
            ? this.rmaService.updatePriority(rma.id, values.priority!)
            : this.rmaService.updateAssignee(rma.id, { assigneeId: values.assigneeId });
        return request.pipe(
          map((updated): BulkRmaResult => ({ id: rma.id, code: rma.code, success: true, message: 'Atualizado', rma: updated })),
          catchError((error) => {
            const failure: BulkRmaResult = { id: rma.id, code: rma.code, success: false, message: bulkErrorMessage(error) };
            if (extractHttpErrorMessage(error, '') !== 'RMA status changed. Refresh the item before trying again.') return of(failure);
            return this.rmaService.getById(rma.id).pipe(
              map((current): BulkRmaResult => ({ ...failure, rma: current })),
              catchError(() => of(failure)),
            );
          }),
        );
      }, 4),
      toArray(),
      finalize(() => { this.form.enable({ emitEvent: false }); this.busy.set(false); this.busyChange.emit(false); }),
    ).subscribe((results) => {
      const byId = new Map(results.map((result) => [result.id, result]));
      const ordered = targets.map((target) => byId.get(target.id)!);
      this.results.set(ordered);
      this.applied.emit(ordered);
      this.action.set(null);
      this.pending.set([]);
    });
  }

  private allowed(action: BulkAction): boolean {
    return action === 'status' ? this.canUpdateStatus() : this.canManage();
  }
}

function bulkErrorMessage(error: unknown): string {
  const message = wipErrorMessage(error, 'Não foi possível atualizar este RMA.');
  const translations: Record<string, string> = {
    'RMA status changed. Refresh the item before trying again.': 'A etapa mudou desde a seleção. Confira o cartão antes de tentar novamente.',
    'RMA already has the requested status.': 'O RMA já está na etapa escolhida.',
    'Only technicians can be assigned to an RMA.': 'O responsável deve ser um técnico ativo.',
    'Only active users can be assigned to an RMA.': 'O responsável deve ser um técnico ativo.',
  };
  return translations[message] ?? message;
}
