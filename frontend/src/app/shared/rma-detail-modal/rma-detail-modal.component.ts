import { Component, DestroyRef, ElementRef, EventEmitter, HostListener, Output, afterNextRender, computed, inject, input, viewChild } from '@angular/core';
import { RmaResponse } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { blockDuration } from '../../core/utils/rma-block';
import { RmaSlaBadgeComponent } from '../rma-sla-badge/rma-sla-badge.component';
import {
  failureCauseLabel,
  failureTypeLabel,
  formatDate,
  formatDateTime,
  initialsOf,
  ownerLabel,
  priorityChipClass,
  priorityLabel,
  productSummary,
  rmaItemTrackableLabel,
  statusLabel,
  warrantyClass,
  warrantyLabel
} from '../../core/utils/rma-ui';

@Component({
  selector: 'app-rma-detail-modal',
  imports: [RmaSlaBadgeComponent],
  templateUrl: './rma-detail-modal.component.html',
  styleUrl: './rma-detail-modal.component.css'
})
export class RmaDetailModalComponent {
  readonly rma = input.required<RmaResponse>();
  readonly canUpdateStatus = input(false);
  readonly canUpdateAssignee = input(false);
  readonly disabled = input(false);
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly statusChange = new EventEmitter<RmaResponse>();
  @Output() readonly assigneeChange = new EventEmitter<RmaResponse>();
  @Output() readonly blockInspect = new EventEmitter<RmaResponse>();
  protected readonly clock = inject(SlaClockService);
  protected readonly blockedDuration = blockDuration;
  protected readonly statusLabel = statusLabel;
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityClass = priorityChipClass;
  protected readonly productSummary = productSummary;
  protected readonly trackableLabel = rmaItemTrackableLabel;
  protected readonly warrantyLabel = warrantyLabel;
  protected readonly warrantyClass = warrantyClass;
  protected readonly failureTypeLabel = failureTypeLabel;
  protected readonly failureCauseLabel = failureCauseLabel;
  protected readonly ownerLabel = ownerLabel;
  protected readonly initials = initialsOf;
  protected readonly dateLabel = formatDate;
  protected readonly dateTimeLabel = formatDateTime;
  protected readonly timeline = computed(() => [...this.rma().statusHistory].sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt)));
  protected readonly assignments = computed(() => [...this.rma().assignmentHistory].sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt)));

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly previousFocus = document.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => this.panel().nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.previousFocus?.focus?.());
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    const covered = document.querySelector('dialog[open]') || document.querySelectorAll('.modal-overlay').length > 1;
    if (!covered && !this.disabled()) this.closed.emit();
  }

  protected trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = this.panel().nativeElement;
    const focusable = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }
}
