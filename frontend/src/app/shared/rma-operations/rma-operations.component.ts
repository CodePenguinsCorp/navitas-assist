import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, finalize, forkJoin, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { OperationsService } from '../../core/services/operations.service';
import { RmaService } from '../../core/services/rma.service';
import {
  ChecklistTemplate,
  RmaApproval,
  RmaChecklistExecution,
  RmaChecklistItem,
  RmaResponse,
} from '../../core/models';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { formatDateTime } from '../../core/utils/rma-ui';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';
@Component({
  selector: 'app-rma-operations',
  imports: [FormsModule, CustomSelectComponent],
  templateUrl: './rma-operations.component.html',
  styleUrl: './rma-operations.component.css',
})
export class RmaOperationsComponent {
  private readonly service = inject(OperationsService);
  private readonly rmaService = inject(RmaService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  readonly rma = input.required<RmaResponse>();
  readonly updated = output<RmaResponse>();
  readonly busyChange = output<boolean>();
  readonly templates = signal<ChecklistTemplate[]>([]);
  readonly executions = signal<RmaChecklistExecution[]>([]);
  readonly approvals = signal<RmaApproval[]>([]);
  readonly busy = signal(false);
  readonly needsRefresh = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  templateId: number | null = null;
  approvalCode = '';
  justification = '';
  relatedId: number | null = null;
  relationNote = '';
  readonly itemNotes: Record<string, string> = {};
  readonly decisionNotes: Record<number, string> = {};
  readonly dateLabel = formatDateTime;
  constructor() {
    let selectedId: number | undefined;
    effect((onCleanup) => {
      const rma = this.rma();
      if (selectedId !== rma.id) {
        selectedId = rma.id;
        this.executions.set([]);
        this.approvals.set([]);
        this.error.set('');
        this.message.set('');
        this.needsRefresh.set(false);
        this.templateId = null;
        this.approvalCode = '';
        this.justification = '';
        this.relationNote = '';
        for (const key of Object.keys(this.itemNotes)) delete this.itemNotes[key];
        for (const key of Object.keys(this.decisionNotes)) delete this.decisionNotes[Number(key)];
      }
      this.relatedId = rma.relatedRmaId ?? null;
      const subscription = this.load(rma.id);
      onCleanup(() => subscription.unsubscribe());
    });
  }
  canOperate() {
    return this.auth.hasAnyRole(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN']);
  }
  canDecide() {
    return this.auth.hasAnyRole(['ADMIN', 'SERVICE_DESK']);
  }
  writesBlocked() {
    return this.busy() || this.needsRefresh();
  }
  templateOptions() {
    return this.templates()
      .filter((t) => t.active)
      .map((t) => ({ value: t.id, label: `${t.name} · v${t.version}` }));
  }
  isLatest(approval: RmaApproval) {
    return !this.approvals().some((a) => a.code === approval.code && a.id > approval.id);
  }
  isLatestExecution(execution: RmaChecklistExecution) {
    return !this.executions().some((e) => e.templateCode === execution.templateCode && e.id > execution.id);
  }
  progress(execution: RmaChecklistExecution) {
    const required = execution.items.filter((i) => i.required);
    return `${required.filter((i) => i.checked).length}/${required.length} obrigatórios`;
  }
  key(execution: RmaChecklistExecution, item: RmaChecklistItem) {
    return `${execution.id}:${item.code}`;
  }
  start() {
    if (!this.canOperate() || this.writesBlocked() || !this.templateId) return;
    this.perform(this.service.start(this.rma().id, this.templateId));
  }
  updateItem(execution: RmaChecklistExecution, item: RmaChecklistItem) {
    const key = this.key(execution, item);
    const note = this.itemNotes[key]?.trim();
    if (!this.canOperate() || this.writesBlocked()) return;
    if (!note) {
      this.error.set('Informe uma nota para registrar a verificação.');
      return;
    }
    this.perform(
      this.service.updateItem(this.rma().id, execution.id, item.code, {
        checked: !item.checked,
        note,
        expectedRevision: execution.revision,
      }),
      () => (this.itemNotes[key] = ''),
    );
  }
  requestApproval() {
    if (!this.canOperate() || this.writesBlocked()) return;
    const code = this.approvalCode.trim();
    const justification = this.justification.trim();
    if (!code || !justification) {
      this.error.set('Informe a finalidade e a justificativa da aprovação.');
      return;
    }
    this.perform(this.service.request(this.rma().id, { code, justification }), () => {
      this.justification = '';
    });
  }
  decide(approval: RmaApproval, status: 'APPROVED' | 'REJECTED') {
    if (!this.canDecide() || this.writesBlocked() || !this.isLatest(approval) || approval.status !== 'PENDING') return;
    const note = this.decisionNotes[approval.id]?.trim();
    if (!note) {
      this.error.set('Informe uma nota para a decisão.');
      return;
    }
    this.perform(
      this.service.decide(this.rma().id, approval.id, { status, note, expectedRevision: approval.revision }),
      () => (this.decisionNotes[approval.id] = ''),
    );
  }
  relate() {
    if (!this.canOperate() || this.writesBlocked()) return;
    if (!this.relationNote.trim()) {
      this.error.set('Informe a nota do relacionamento.');
      return;
    }
    this.perform(
      this.service.relate(this.rma().id, {
        relatedRmaId: this.relatedId,
        note: this.relationNote.trim(),
        expectedUpdatedAt: this.rma().updatedAt,
      }),
      () => (this.relationNote = ''),
    );
  }
  private load(id: number) {
    return forkJoin({
      templates: this.service.templates(),
      executions: this.service.executions(id),
      approvals: this.service.approvals(id),
    }).subscribe({
      next: (r) => {
        this.templates.set(r.templates);
        this.executions.set(r.executions);
        this.approvals.set(r.approvals);
      },
      error: (e) => this.error.set(extractHttpErrorMessage(e, 'Não foi possível carregar as verificações.')),
    });
  }
  private perform(request: Observable<unknown>, success?: () => void) {
    this.busy.set(true);
    this.busyChange.emit(true);
    this.error.set('');
    this.message.set('');
    const id = this.rma().id;
    request
      .pipe(
        tap(() => {
          this.needsRefresh.set(true);
          success?.();
          this.message.set('Operação registrada.');
        }),
        switchMap(() => this.readState(id)),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.busy.set(false);
          this.busyChange.emit(false);
        }),
      )
      .subscribe({
        next: (r) => {
          this.applyState(r);
          this.message.set('Operação registrada. Regras de passagem atualizadas.');
        },
        error: (e) =>
          this.error.set(
            this.needsRefresh()
              ? 'A operação foi registrada, mas a consulta falhou. Atualize as verificações antes de continuar.'
              : extractHttpErrorMessage(e, 'Não foi possível registrar a operação.'),
          ),
      });
  }
  refresh() {
    if (this.busy()) return;
    this.busy.set(true);
    this.busyChange.emit(true);
    this.error.set('');
    this.readState(this.rma().id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.busy.set(false);
          this.busyChange.emit(false);
        }),
      )
      .subscribe({
        next: (r) => {
          this.applyState(r);
          this.message.set('Verificações e regras de passagem atualizadas.');
        },
        error: () => this.error.set('A consulta falhou. Tente atualizar as verificações novamente.'),
      });
  }
  private readState(id: number) {
    return forkJoin({
      rma: this.rmaService.getById(id),
      executions: this.service.executions(id),
      approvals: this.service.approvals(id),
    });
  }
  private applyState(r: { rma: RmaResponse; executions: RmaChecklistExecution[]; approvals: RmaApproval[] }) {
    this.executions.set(r.executions);
    this.approvals.set(r.approvals);
    this.needsRefresh.set(false);
    this.updated.emit(r.rma);
  }
}
