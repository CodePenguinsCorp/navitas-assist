import { HttpContext } from '@angular/common/http';
import { Component, DestroyRef, EventEmitter, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { RmaResponse } from '../../core/models';
import { SKIP_GLOBAL_LOADING } from '../../core/interceptors/loading.interceptor';
import { PermissionService } from '../../core/services/permission.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';
import { RmaBlockHistoryComponent } from '../rma-block-history/rma-block-history.component';

@Component({
  selector: 'app-rma-block-panel',
  imports: [ReactiveFormsModule, ModalFocusDirective, RmaBlockHistoryComponent],
  templateUrl: './rma-block-panel.component.html',
  styles: `dialog { width: min(42rem, calc(100vw - 2rem)); max-height: 90dvh; border: 0; overflow: auto; } dialog::backdrop { background: var(--backdrop); }
    .loading-indicator { display: inline-block; width: 1rem; height: 1rem; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: block-loading-spin 1s linear infinite; }
    @keyframes block-loading-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .loading-indicator { animation: none; } }`,
})
export class RmaBlockPanelComponent {
  /** Native adapter: registers the dialog in the shared stack around showModal()/close(). */
  @ViewChild(ModalFocusDirective, { static: true }) private modal!: ModalFocusDirective;
  @Output() readonly updated = new EventEmitter<RmaResponse>();
  private readonly service = inject(RmaService);
  private readonly permissions = inject(PermissionService);
  private readonly builder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private loadRequest?: Subscription;
  private selectedId: number | null = null;
  protected readonly rma = signal<RmaResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly canEdit = computed(() => this.permissions.hasPermission('rma.impedimentos'));
  protected readonly blockForm = this.builder.nonNullable.group({ reason: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]], category: ['', Validators.maxLength(80)] });
  protected readonly resolveForm = this.builder.nonNullable.group({ resolutionNote: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]] });

  open(id: number): void {
    if (this.busy()) return;
    this.selectedId = id;
    this.error.set('');
    this.blockForm.reset();
    this.resolveForm.reset();
    this.modal.openNative();
    this.load();
  }

  protected load(): void {
    if (this.selectedId === null) return;
    this.loadRequest?.unsubscribe();
    this.loading.set(true);
    this.rma.set(null);
    const context = new HttpContext().set(SKIP_GLOBAL_LOADING, true);
    this.loadRequest = this.service.getById(this.selectedId, context).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: (rma) => { this.rma.set(rma); this.error.set(''); },
      error: () => this.error.set('Não foi possível carregar os impedimentos do RMA.'),
    });
  }

  protected close(): void {
    if (this.busy()) return;
    this.loadRequest?.unsubscribe();
    this.modal.closeNative();
  }

  protected hasError(control: AbstractControl): boolean {
    return control.invalid && (control.dirty || control.touched);
  }

  protected textError(control: AbstractControl, requiredMessage: string): string {
    const maxLength = control.getError('maxlength') as { requiredLength: number } | null;
    if (maxLength) return `Use até ${maxLength.requiredLength} caracteres.`;
    return requiredMessage;
  }

  protected save(): void {
    const rma = this.rma();
    if (!rma || this.busy() || !this.canEdit()) return;
    const form = rma.currentBlock ? this.resolveForm : this.blockForm;
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }
    const request = rma.currentBlock
      ? this.service.resolveBlock(rma.id, rma.currentBlock.id, { resolutionNote: this.resolveForm.getRawValue().resolutionNote.trim() })
      : this.service.block(rma.id, { reason: this.blockForm.getRawValue().reason.trim(), category: this.blockForm.getRawValue().category.trim() || null });
    this.busy.set(true);
    this.error.set('');
    form.disable();
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.busy.set(false); form.enable(); })).subscribe({
      next: (updated) => {
        this.rma.set(updated);
        this.blockForm.reset();
        this.resolveForm.reset();
        this.updated.emit(updated);
      },
      error: (error) => {
        const message = extractHttpErrorMessage(error, 'Não foi possível atualizar o impedimento.');
        this.error.set(message === 'RMA is already blocked.' ? 'O RMA já foi bloqueado. Feche e abra o painel para atualizar.' : message === 'RMA block is no longer active.' ? 'Este impedimento já foi resolvido. Feche e abra o painel para atualizar.' : message);
      },
    });
  }
}
