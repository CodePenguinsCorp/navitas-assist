import { Component, EventEmitter, Output, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RMA_STATUS_FLOW } from '../../core/mock-data';
import { AssignableUserResponse, RmaResponse, RmaStatus } from '../../core/models';
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
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';
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
  imports: [CustomSelectComponent, ModalFocusDirective, RmaSlaBadgeComponent, RouterLink],
  templateUrl: './rma-detail-modal.component.html',
  styleUrl: './rma-detail-modal.component.css'
})
export class RmaDetailModalComponent {
  readonly rma = input.required<RmaResponse>();
  readonly canUpdateStatus = input(false);
  readonly canUpdateAssignee = input(false);
  readonly disabled = input(false);
  /** Users who can receive the RMA (the host's assignable-users source). */
  readonly assignableUsers = input<readonly AssignableUserResponse[]>([]);
  /** Failure of the last action started here, such as an assignment. */
  readonly actionError = input('');
  /** Page control that receives focus when the card that opened the detail is gone on close. */
  readonly fallbackFocus = input<HTMLElement | null>(null);
  @Output() readonly closed = new EventEmitter<void>();
  /** A status picked in the header selector; the host runs its usual status-change flow. */
  @Output() readonly statusChange = new EventEmitter<{ rma: RmaResponse; status: RmaStatus }>();
  /** A person (or null, unassigned) picked in the inline selector; the host saves it. */
  @Output() readonly assigneeChange = new EventEmitter<{ rma: RmaResponse; assigneeId: number | null }>();
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

  /** Same choices as the former assignment dialog: unassigned plus the eligible users. */
  protected readonly assigneeOptions = computed<ReadonlyArray<CustomSelectOption<number | null>>>(() => {
    const rma = this.rma();
    const users = this.assignableUsers();
    const options: CustomSelectOption<number | null>[] = [
      { value: null, label: 'Sem responsável', avatar: '' },
      ...users.map((user) => ({ value: user.id, label: user.fullName, hint: '@' + user.username, avatar: initialsOf(user.fullName) }))
    ];
    if (rma.assigneeId !== null && !users.some((user) => user.id === rma.assigneeId)) {
      options.push({ value: rma.assigneeId, label: rma.assigneeName ?? 'Responsável atual', avatar: initialsOf(rma.assigneeName), hint: 'Não pode receber novas atribuições', disabled: true });
    }
    return options;
  });

  protected chooseAssignee(assigneeId: unknown): void {
    const rma = this.rma();
    if (assigneeId !== rma.assigneeId) this.assigneeChange.emit({ rma, assigneeId: assigneeId as number | null });
  }

  protected chooseStatus(status: unknown): void {
    const rma = this.rma();
    if (status !== rma.status) this.statusChange.emit({ rma, status: status as RmaStatus });
  }
}
