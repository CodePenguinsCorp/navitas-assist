import { RmaWarrantyFieldComponent } from '../rma-warranty-field/rma-warranty-field.component';
import { RmaDiagnosisComponent } from '../rma-diagnosis/rma-diagnosis.component';
import { Component, EventEmitter, Output, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AssignableUserResponse, RmaResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import {
  historyEntryTitle,
  invoiceFact,
  purchaseFact,
  receiptFacts,
  repairFacts,
  rmaHistory,
  rmaItemFacts,
  sectionLabel,
  stageFact
} from '../../core/utils/rma-detail';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';
import { IconComponent } from '../icon/icon.component';
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';
import { RmaBlocksSectionComponent } from '../rma-blocks-section/rma-blocks-section.component';
import { RmaDueDateFieldComponent } from '../rma-due-date-field/rma-due-date-field.component';
import { RmaPriorityFieldComponent } from '../rma-priority-field/rma-priority-field.component';
import { RmaReportLinkComponent } from '../rma-report-link/rma-report-link.component';
import { RmaStatusFieldComponent } from '../rma-status-field/rma-status-field.component';
import { RmaStageTimesComponent } from '../rma-stage-times/rma-stage-times.component';
import {
  formatDate,
  formatDateTime,
  initialsOf,
  itemCountLabel,
  ownerLabel,
  productSummary,
  statusLabel,
  warrantyClass,
  warrantyLabel
} from '../../core/utils/rma-ui';

@Component({
  selector: 'app-rma-detail-modal',
  imports: [RmaWarrantyFieldComponent, CustomSelectComponent, IconComponent, ModalFocusDirective, RmaBlocksSectionComponent, RmaDueDateFieldComponent, RmaPriorityFieldComponent, RmaReportLinkComponent, RmaStageTimesComponent, RmaStatusFieldComponent, RmaDiagnosisComponent, RouterLink],
  templateUrl: './rma-detail-modal.component.html',
  styleUrl: './rma-detail-modal.component.css'
})
export class RmaDetailModalComponent {
  readonly rma = input.required<RmaResponse>();
  readonly canUpdateStatus = input(false);
  readonly canUpdateAssignee = input(false);
  /** `rma.editar`: enables inline editing of the due date and item warranty. */
  readonly canEditDueDate = input(false);
  readonly disabled = input(false);
  /** Users who can receive the RMA (the host's assignable-users source). */
  readonly assignableUsers = input<readonly AssignableUserResponse[]>([]);
  /** Failure of the last action started here, such as an assignment. */
  readonly actionError = input('');
  /** Page control that receives focus when the card that opened the detail is gone on close. */
  readonly fallbackFocus = input<HTMLElement | null>(null);
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly busyChange = new EventEmitter<boolean>();
  protected readonly warrantyBusy = signal(false);
  protected readonly statusBusy = signal(false);
  protected readonly diagnosisBusy = signal(false);
  protected readonly writePending = computed(() => this.disabled() || this.statusBusy() || this.diagnosisBusy() || this.warrantyBusy());
  /** A person (or null, unassigned) picked in the inline selector; the host saves it. */
  @Output() readonly assigneeChange = new EventEmitter<{ rma: RmaResponse; assigneeId: number | null }>();
  /** The RMA returned by a save made inside the detail (impediments, due date). */
  @Output() readonly rmaUpdated = new EventEmitter<RmaResponse>();
  protected readonly clock = inject(ClockService);
  protected readonly statusLabel = statusLabel;
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
  protected readonly repairFacts = repairFacts;
  protected readonly activity = computed(() => rmaHistory(this.rma()));
  protected readonly historyEntryTitle = historyEntryTitle;
  protected readonly stage = computed(() => stageFact(this.rma(), this.clock.now()));
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

  /** Button, backdrop and Escape close the detail only while no write is pending. */
  protected requestClose(): void {
    if (!this.writePending()) this.closed.emit();
  }

  protected chooseAssignee(assigneeId: unknown): void {
    const rma = this.rma();
    if (assigneeId !== rma.assigneeId) this.assigneeChange.emit({ rma, assigneeId: assigneeId as number | null });
  }
}
