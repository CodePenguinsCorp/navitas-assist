import { Component, DestroyRef, ElementRef, EventEmitter, Injector, Output, afterNextRender, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { RmaResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { PermissionService } from '../../core/services/permission.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { blockedLabel } from '../../core/utils/rma-detail';
import { RmaBlockHistoryComponent } from '../rma-block-history/rma-block-history.component';

type BlocksMode = 'idle' | 'block' | 'resolve';

/**
 * Impediments of an RMA embedded in its detail: the current block (or "Sem impedimento"),
 * the inline block/resolve forms for `rma.impedimentos` and the collapsed previous episodes.
 */
@Component({
  selector: 'app-rma-blocks-section',
  imports: [ReactiveFormsModule, RmaBlockHistoryComponent],
  templateUrl: './rma-blocks-section.component.html',
  styleUrl: './rma-blocks-section.component.css'
})
export class RmaBlocksSectionComponent {
  readonly rma = input.required<RmaResponse>();
  /** The host is writing something else (status, assignment): the inline actions wait. */
  readonly disabled = input(false);
  /** The RMA returned by a block or resolve; the host refreshes its card or list. */
  @Output() readonly updated = new EventEmitter<RmaResponse>();

  private readonly service = inject(RmaService);
  private readonly permissions = inject(PermissionService);
  private readonly builder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly clock = inject(ClockService);
  protected readonly blockedLabel = blockedLabel;

  /** Follows the host input and shows the saved RMA right away. */
  protected readonly current = linkedSignal(() => this.rma());
  protected readonly mode = signal<BlocksMode>('idle');
  protected readonly historyOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly canEdit = computed(() => this.permissions.hasPermission('rma.impedimentos'));
  protected readonly previousCount = computed(() => this.current().blockHistory.filter((block) => block.resolvedAt !== null).length);
  protected readonly blockForm = this.builder.nonNullable.group({ reason: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]], category: ['', Validators.maxLength(80)] });
  protected readonly resolveForm = this.builder.nonNullable.group({ resolutionNote: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]] });

  protected start(mode: Exclude<BlocksMode, 'idle'>): void {
    if (this.busy() || this.disabled() || !this.canEdit()) return;
    this.error.set('');
    this.blockForm.reset();
    this.resolveForm.reset();
    this.mode.set(mode);
    this.focusAfterRender(mode === 'block' ? '#rma-block-reason' : '#rma-block-resolution');
  }

  protected cancel(): void {
    if (this.busy()) return;
    this.error.set('');
    this.mode.set('idle');
    this.focusAfterRender('[data-blocks-trigger]');
  }

  /** Escape closes the inline form first; the detail below ignores the consumed event. */
  protected cancelOnEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
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
    const rma = this.current();
    const resolving = this.mode() === 'resolve';
    if (this.busy() || !this.canEdit() || this.mode() === 'idle' || (resolving && !rma.currentBlock)) return;
    const form = resolving ? this.resolveForm : this.blockForm;
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }
    const request = resolving
      ? this.service.resolveBlock(rma.id, rma.currentBlock!.id, { resolutionNote: this.resolveForm.getRawValue().resolutionNote.trim() })
      : this.service.block(rma.id, { reason: this.blockForm.getRawValue().reason.trim(), category: this.blockForm.getRawValue().category.trim() || null });
    this.busy.set(true);
    this.error.set('');
    form.disable();
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.busy.set(false); form.enable(); })).subscribe({
      next: (updated) => {
        this.current.set(updated);
        this.mode.set('idle');
        this.blockForm.reset();
        this.resolveForm.reset();
        this.updated.emit(updated);
        this.focusAfterRender('[data-blocks-trigger], .blocks-section');
      },
      error: (error) => {
        const message = extractHttpErrorMessage(error, 'Não foi possível atualizar o impedimento.');
        this.error.set(
          message === 'RMA is already blocked.' ? 'O RMA já foi bloqueado. Feche e abra o detalhe para atualizar.'
            : message === 'RMA block is no longer active.' ? 'Este impedimento já foi resolvido. Feche e abra o detalhe para atualizar.'
              : message
        );
      }
    });
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
