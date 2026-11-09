import { Component, DestroyRef, ElementRef, EventEmitter, HostListener, Output, afterNextRender, computed, inject, input, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RMA_STATUS_FLOW } from '../../core/mock-data';
import { RmaResponse, RmaStatus } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import {
  NO_DIAGNOSIS_LABEL,
  blockedLabel,
  diagnosisFacts,
  invoiceFact,
  purchaseFact,
  receiptFacts,
  repairFacts,
  rmaHistory,
  rmaItemFacts,
  sectionLabel
} from '../../core/utils/rma-detail';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';
import { RmaSlaBadgeComponent } from '../rma-sla-badge/rma-sla-badge.component';
import {
  formatDate,
  formatDateTime,
  initialsOf,
  itemCountLabel,
  ownerLabel,
  priorityLabel,
  productSummary,
  statusLabel,
  warrantyClass,
  warrantyLabel
} from '../../core/utils/rma-ui';

@Component({
  selector: 'app-rma-detail-modal',
  imports: [CustomSelectComponent, RmaSlaBadgeComponent, RouterLink],
  templateUrl: './rma-detail-modal.component.html',
  styleUrl: './rma-detail-modal.component.css'
})
export class RmaDetailModalComponent {
  readonly rma = input.required<RmaResponse>();
  readonly canUpdateStatus = input(false);
  readonly canUpdateAssignee = input(false);
  readonly disabled = input(false);
  @Output() readonly closed = new EventEmitter<void>();
  /** A status picked in the header selector; the host runs its usual status-change flow. */
  @Output() readonly statusChange = new EventEmitter<{ rma: RmaResponse; status: RmaStatus }>();
  @Output() readonly assigneeChange = new EventEmitter<RmaResponse>();
  @Output() readonly blockInspect = new EventEmitter<RmaResponse>();
  protected readonly clock = inject(SlaClockService);
  protected readonly blockedLabel = blockedLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly priorityLabel = priorityLabel;
  protected readonly productSummary = productSummary;
  protected readonly itemCountLabel = itemCountLabel;
  protected readonly warrantyLabel = warrantyLabel;
  protected readonly warrantyClass = warrantyClass;
  protected readonly ownerLabel = ownerLabel;
  protected readonly initials = initialsOf;
  protected readonly dateLabel = formatDate;
  protected readonly dateTimeLabel = formatDateTime;
  protected readonly sectionLabel = sectionLabel;
  protected readonly invoiceFact = invoiceFact;
  protected readonly purchaseFact = purchaseFact;
  protected readonly rmaItemFacts = rmaItemFacts;
  protected readonly receiptFacts = receiptFacts;
  protected readonly diagnosisFacts = diagnosisFacts;
  protected readonly repairFacts = repairFacts;
  protected readonly noDiagnosisLabel = NO_DIAGNOSIS_LABEL;
  protected readonly activity = computed(() => rmaHistory(this.rma()));
  /** Every stage but the current one can be chosen (the same rule as the status dialog). */
  protected readonly statusOptions = computed<ReadonlyArray<CustomSelectOption<RmaStatus>>>(() =>
    RMA_STATUS_FLOW.map((status) => ({
      value: status,
      label: statusLabel(status),
      status,
      hint: status === this.rma().status ? 'Status atual' : undefined
    }))
  );

  protected chooseStatus(status: unknown): void {
    const rma = this.rma();
    if (status !== rma.status) this.statusChange.emit({ rma, status: status as RmaStatus });
  }

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
