import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ChecklistTemplate, ChecklistTemplateRequest } from '../../core/models';
import { OperationsService } from '../../core/services/operations.service';
import { stableCode } from '../../core/utils/workflow-ui';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
@Component({
  selector: 'app-checklists',
  imports: [FormsModule],
  templateUrl: './checklists.component.html',
  styleUrl: './checklists.component.css',
})
export class ChecklistsComponent {
  private readonly service = inject(OperationsService);
  readonly templates = signal<ChecklistTemplate[]>([]);
  readonly editor = signal<ChecklistTemplateRequest | null>(null);
  readonly editingId = signal<number | undefined>(undefined);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  constructor() {
    this.load();
  }
  load() {
    this.busy.set(true);
    this.service
      .templates()
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({ next: (t) => this.templates.set(t), error: (e) => this.fail(e) });
  }
  edit(template?: ChecklistTemplate) {
    if (this.busy()) return;
    this.error.set('');
    this.message.set('');
    this.editingId.set(template?.id);
    this.editor.set(
      template
        ? { ...structuredClone(template), expectedVersion: template.version }
        : { code: '', name: '', active: true, items: [{ code: 'ITEM_1', label: '', required: true }] },
    );
  }
  rename(value: string) {
    const e = this.editor();
    if (!e) return;
    const old = stableCode(e.name);
    e.name = value;
    if (!this.editingId() && (!e.code || e.code === old)) e.code = stableCode(value);
  }
  add() {
    const items = this.editor()?.items;
    if (!items) return;
    let index = items.length + 1;
    while (items.some((item) => item.code === 'ITEM_' + index)) index++;
    items.push({ code: 'ITEM_' + index, label: '', required: true });
  }
  move(index: number, offset: number) {
    const items = this.editor()?.items;
    if (!items || index + offset < 0 || index + offset >= items.length) return;
    [items[index], items[index + offset]] = [items[index + offset], items[index]];
  }
  save() {
    const e = this.editor();
    if (!e || this.busy()) return;
    if (!e.items.some((i) => i.required)) {
      this.error.set('Inclua ao menos um item obrigatório.');
      return;
    }
    if (!e.name.trim() || !e.code.trim() || e.items.some((i) => !i.code.trim() || !i.label.trim())) {
      this.error.set('Preencha nome, código e descrição dos itens.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.service
      .saveTemplate(e, this.editingId())
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (t) => {
          this.templates.update((all) => [...all.filter((x) => x.id !== t.id), t]);
          this.editor.set(null);
          this.message.set('Modelo salvo. Execuções anteriores preservam sua versão original.');
        },
        error: (e) => this.fail(e),
      });
  }
  close() {
    if (!this.busy()) this.editor.set(null);
  }
  private fail(e: unknown) {
    this.error.set(extractHttpErrorMessage(e, 'Não foi possível salvar o modelo.'));
  }
}
