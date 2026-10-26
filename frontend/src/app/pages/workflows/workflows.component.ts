import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin, switchMap } from 'rxjs';
import { WorkflowService } from '../../core/services/workflow.service';
import { OperationsService } from '../../core/services/operations.service';
import {
  ChecklistTemplate,
  PublishedWorkflow,
  WorkflowDefinition,
  WorkflowDraft,
  WorkflowStatusDefinition,
} from '../../core/models';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { stableCode } from '../../core/utils/workflow-ui';
import { CustomSelectComponent } from '../../shared/form-controls/custom-select/custom-select.component';
import { WorkflowTransitionsComponent } from './workflow-transitions.component';
@Component({
  selector: 'app-workflows',
  imports: [FormsModule, CustomSelectComponent, WorkflowTransitionsComponent],
  templateUrl: './workflows.component.html',
  styleUrl: './workflows.component.css',
})
export class WorkflowsComponent {
  private readonly service = inject(WorkflowService);
  private readonly operations = inject(OperationsService);
  readonly published = signal<PublishedWorkflow | null>(null);
  readonly definition = signal<WorkflowDefinition | null>(null);
  readonly revision = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly templates = signal<ChecklistTemplate[]>([]);
  readonly source = signal('');
  readonly categories = [
    { value: 'PENDING', label: 'Pendente' },
    { value: 'IN_PROGRESS', label: 'Em andamento' },
    { value: 'DONE', label: 'Encerrado' },
  ];
  readonly slaStages = ['RECEIVED', 'TRIAGE', 'IN_DIAGNOSIS', 'WAITING_PART', 'IN_REPAIR', 'IN_TESTS'].map((value) => ({
    value,
    label: (
      {
        RECEIVED: 'Recebimento',
        TRIAGE: 'Triagem',
        IN_DIAGNOSIS: 'Diagnóstico',
        WAITING_PART: 'Espera de peça',
        IN_REPAIR: 'Reparo',
        IN_TESTS: 'Testes',
      } as Record<string, string>
    )[value],
  }));
  constructor() {
    this.busy.set(true);
    forkJoin({
      published: this.service.published(),
      draft: this.service.draft(),
      templates: this.operations.templates(),
    })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (result) => {
          this.published.set(result.published);
          this.applyDraft(result.draft);
          this.templates.set(result.templates);
        },
        error: (e) => this.fail(e),
      });
  }
  start() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.service
      .start()
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({ next: (d) => this.applyDraft(d), error: (e) => this.fail(e) });
  }
  save() {
    const d = this.definition();
    if (!d || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    this.service
      .save(this.revision(), d)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (d) => {
          this.applyDraft(d);
          this.message.set('Rascunho salvo. A operação continua usando a versão publicada.');
        },
        error: (e) => this.fail(e),
      });
  }
  publish() {
    const d = this.definition();
    if (!d || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    this.service
      .save(this.revision(), d)
      .pipe(
        switchMap((draft) => {
          this.revision.set(draft.revision);
          return this.service.publish(draft.revision);
        }),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (p) => {
          this.published.set(p);
          this.definition.set(null);
          this.message.set('Fluxo publicado. Novas operações usam a versão ' + p.version + '.');
        },
        error: (e) => this.fail(e),
      });
  }
  discard() {
    if (this.busy() || !this.definition()) return;
    this.busy.set(true);
    this.error.set('');
    this.service
      .discard(this.revision())
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.definition.set(null);
          this.message.set('Rascunho descartado.');
        },
        error: (e) => this.fail(e),
      });
  }
  addStatus() {
    const d = this.definition();
    if (!d || this.busy()) return;
    const label = 'Novo status ' + (d.statuses.length + 1);
    d.statuses.push({ code: stableCode(label), label, category: 'IN_PROGRESS', active: true, slaStage: 'TRIAGE' });
    this.touch();
  }
  rename(status: WorkflowStatusDefinition, value: string) {
    const old = stableCode(status.label);
    status.label = value;
    if (!this.isPublished(status.code) && status.code === old) this.changeCode(status, stableCode(value));
    this.touch();
  }
  changeCode(status: WorkflowStatusDefinition, code: string) {
    const d = this.definition();
    if (!d || this.isPublished(status.code)) return;
    const old = status.code;
    status.code = code;
    if (d.initialStatus === old) d.initialStatus = code;
    for (const t of d.transitions) {
      if (t.from === old) t.from = code;
      if (t.to === old) t.to = code;
      for (const condition of t.conditions) {
        if (condition.type === 'RELATED_STATUS' && condition.value === old) condition.value = code;
      }
    }
    if (this.source() === old) this.source.set(code);
    this.touch();
  }
  isPublished(code: string) {
    return this.published()?.definition.statuses.some((s) => s.code === code) ?? false;
  }
  move(index: number, offset: number) {
    const d = this.definition();
    if (!d || index + offset < 0 || index + offset >= d.statuses.length) return;
    [d.statuses[index], d.statuses[index + offset]] = [d.statuses[index + offset], d.statuses[index]];
    this.touch();
  }
  archive(status: WorkflowStatusDefinition) {
    const d = this.definition();
    if (!d) return;
    status.active = !status.active;
    if (!status.active) d.transitions = d.transitions.filter((t) => t.to !== status.code);
    this.touch();
  }
  remove(status: WorkflowStatusDefinition) {
    const d = this.definition();
    if (!d) return;
    d.statuses = d.statuses.filter((s) => s !== status);
    d.transitions = d.transitions.filter((t) => t.from !== status.code && t.to !== status.code);
    this.touch();
  }
  touch() {
    const d = this.definition();
    if (d) this.definition.set({ ...d });
  }
  statusOptions() {
    return (this.definition()?.statuses ?? [])
      .filter((s) => s.active && s.category !== 'DONE')
      .map((s) => ({ value: s.code, label: s.label }));
  }
  private applyDraft(d: WorkflowDraft) {
    this.revision.set(d.revision);
    this.definition.set(d.definition ? structuredClone(d.definition) : null);
    if (d.definition && !d.definition.statuses.some((s) => s.code === this.source()))
      this.source.set(d.definition.initialStatus);
  }
  private fail(e: unknown) {
    this.error.set(extractHttpErrorMessage(e, 'Não foi possível salvar o fluxo.'));
  }
}
