import { Component, DestroyRef, ElementRef, EventEmitter, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { RmaResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { RmaBlockHistoryComponent } from '../rma-block-history/rma-block-history.component';

@Component({
  selector: 'app-rma-block-panel',
  imports: [ReactiveFormsModule, RmaBlockHistoryComponent],
  templateUrl: './rma-block-panel.component.html',
  styles: `dialog { width: min(42rem, calc(100vw - 2rem)); max-height: 90dvh; border: 0; overflow: auto; } dialog::backdrop { background: #0f172a99; }`,
})
export class RmaBlockPanelComponent {
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLDialogElement>;
  @Output() readonly updated = new EventEmitter<RmaResponse>();
  private readonly service = inject(RmaService);
  private readonly auth = inject(AuthService);
  private readonly builder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private loadRequest?: Subscription;
  private selectedId: number | null = null;
  protected readonly rma = signal<RmaResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly canEdit = computed(() => this.auth.hasAnyRole(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN']));
  protected readonly blockForm = this.builder.nonNullable.group({ reason: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]], category: ['', Validators.maxLength(80)] });
  protected readonly resolveForm = this.builder.nonNullable.group({ resolutionNote: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]] });

  open(id: number): void {
    if (this.busy()) return;
    this.selectedId = id;
    this.blockForm.reset();
    this.resolveForm.reset();
    if (!this.dialog.nativeElement.open) this.dialog.nativeElement.showModal();
    this.load();
  }

  protected load(): void {
    if (this.selectedId === null) return;
    this.loadRequest?.unsubscribe();
    this.loading.set(true);
    this.rma.set(null);
    this.error.set('');
    this.loadRequest = this.service.getById(this.selectedId).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: (rma) => this.rma.set(rma),
      error: () => this.error.set('Não foi possível carregar os impedimentos do RMA.'),
    });
  }

  protected close(): void {
    if (this.busy()) return;
    this.loadRequest?.unsubscribe();
    this.dialog.nativeElement.close();
  }

  protected cancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  protected save(): void {
    const rma = this.rma();
    if (!rma || this.busy() || !this.canEdit()) return;
    const form = rma.currentBlock ? this.resolveForm : this.blockForm;
    if (form.invalid) {
      form.markAllAsTouched();
      this.error.set('Informe o motivo ou a resolução com até 1000 caracteres e categoria com até 80.');
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
