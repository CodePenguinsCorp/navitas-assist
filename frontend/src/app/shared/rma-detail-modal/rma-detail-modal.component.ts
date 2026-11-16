import { RmaProtocolsComponent } from '../rma-protocols/rma-protocols.component';
import { RmaHistoryListComponent } from '../rma-history-list/rma-history-list.component';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { RmaRepairPanelComponent } from '../rma-repair-panel/rma-repair-panel.component';
import { RmaPartsPanelComponent } from '../rma-parts-panel/rma-parts-panel.component';
import { RmaWarrantyFieldComponent } from '../rma-warranty-field/rma-warranty-field.component';
import { RmaDiagnosisComponent } from '../rma-diagnosis/rma-diagnosis.component';
import { Component, EventEmitter, Injector, Output, afterNextRender, computed, inject, input, signal, viewChild, viewChildren } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AssignableUserResponse, RmaResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import {
  blockedLabel,
  historyEntryTitle,
  invoiceFact,
  purchaseFact,
  receiptFacts,
  rmaHistory,
  rmaItemFacts,
  sectionLabel
} from '../../core/utils/rma-detail';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';
import { CollapsibleSectionComponent } from '../collapsible-section/collapsible-section.component';
import { assigneeSelectOptions } from '../rma-assignee-field/rma-assignee-field.component';
import { IconComponent } from '../icon/icon.component';
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';
import { RmaBlocksSectionComponent } from '../rma-blocks-section/rma-blocks-section.component';
import { RmaDueDateFieldComponent } from '../rma-due-date-field/rma-due-date-field.component';
import { RmaPriorityFieldComponent } from '../rma-priority-field/rma-priority-field.component';
import { RmaReportLinkComponent } from '../rma-report-link/rma-report-link.component';
import { RmaStatusFieldComponent } from '../rma-status-field/rma-status-field.component';
import { RmaStatusTransitionComponent } from '../rma-status-transition/rma-status-transition.component';
import { RmaDeadlineChipComponent } from '../rma-deadline-chip/rma-deadline-chip.component';
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
  imports: [RmaProtocolsComponent, RmaHistoryListComponent, CollapsibleSectionComponent, RmaRepairPanelComponent, RmaPartsPanelComponent, RmaWarrantyFieldComponent, CustomSelectComponent, IconComponent, ModalFocusDirective, RmaBlocksSectionComponent, RmaDueDateFieldComponent, RmaPriorityFieldComponent, RmaReportLinkComponent, RmaStageTimesComponent, RmaStatusFieldComponent, RmaStatusTransitionComponent, RmaDiagnosisComponent, RmaDeadlineChipComponent, RouterLink],
  templateUrl: './rma-detail-modal.component.html',
  styleUrl: './rma-detail-modal.component.css'
})
export class RmaDetailModalComponent {
  private readonly rmaService = inject(RmaService);
  protected readonly repairError = signal('');
  private refreshRequest?: Subscription;
  protected refreshRepair(): void {
    const id = this.rma().id;
    this.repairError.set('');
    this.refreshRequest?.unsubscribe();
    this.refreshRequest = this.rmaService.getById(id).subscribe({
      next: updated => this.applyUpdate(updated),
      error: error => this.repairError.set(extractHttpErrorMessage(error, 'Não foi possível atualizar o histórico.'))
    });
  }

  /**
   * An OS saved or re-read inside the detail. A response of another OS never replaces this one, and a re-read still
   * in flight is dropped: it may carry a snapshot older than this response.
   */
  protected applyUpdate(updated: RmaResponse): void {
    if (updated.id !== this.rma().id) return;
    this.refreshRequest?.unsubscribe();
    this.rmaUpdated.emit(updated);
  }
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
  /** Writers of the detail (status, priority, due date, warranty, diagnosis, impediments), each counted on its own. */
  private readonly writers = signal<Readonly<Record<string, number>>>({});
  protected readonly writeBusy = computed(() => Object.values(this.writers()).some((count) => count > 0));
  protected readonly writePending = computed(() => this.disabled() || this.writeBusy());

  protected setWriterBusy(key: string, busy: boolean): void {
    const before = this.writeBusy();
    this.writers.update((current) => ({ ...current, [key]: Math.max((current[key] ?? 0) + (busy ? 1 : -1), 0) }));
    if (this.writeBusy() !== before) this.busyChange.emit(this.writeBusy());
  }

  /** True when the host or a writer other than `key` is busy (a writer never disables itself). */
  protected busyExcept(key: string): boolean {
    return this.disabled() || Object.entries(this.writers()).some(([name, count]) => name !== key && count > 0);
  }
  /** A person (or null, unassigned) picked in the inline selector; the host saves it. */
  @Output() readonly assigneeChange = new EventEmitter<{ rma: RmaResponse; assigneeId: number | null }>();
  /** The OS returned by a save made inside the detail (impediments, due date). */
  @Output() readonly rmaUpdated = new EventEmitter<RmaResponse>();
  protected readonly clock = inject(ClockService);
  protected readonly statusLabel = statusLabel;
  protected readonly blockedLabel = blockedLabel;
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
  protected readonly activity = computed(() => rmaHistory(this.rma()));
  protected readonly historyEntryTitle = historyEntryTitle;
  /** Same choices as the former assignment dialog: unassigned plus the eligible users. */
  protected readonly assigneeOptions = computed<ReadonlyArray<CustomSelectOption<number | null>>>(() =>
    assigneeSelectOptions(this.rma(), this.assignableUsers()));

  /** Button, backdrop and Escape close the detail only while no write is pending. */
  protected requestClose(): void {
    if (!this.writePending()) this.closed.emit();
  }

  /** Block flag beside the status: brings the Impedimentos section into view and moves focus there. */
  protected showBlocks(section: HTMLElement): void {
    const fold = this.blocks()?.section();
    const wasOpen = fold?.isOpen() ?? true;
    fold?.setOpen(true);
    section.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    const focus = () => section.querySelector<HTMLElement>('.blocks-section')?.focus({ preventScroll: true });
    // A folded body is hidden until the next render, when it can take focus.
    if (wasOpen) focus(); else afterNextRender(focus, { injector: this.injector });
  }

  private readonly injector = inject(Injector);
  private readonly blocks = viewChild(RmaBlocksSectionComponent);
  private readonly ownSections = viewChildren(CollapsibleSectionComponent);
  private readonly interventions = viewChild(RmaRepairPanelComponent);
  private readonly partsPanel = viewChild(RmaPartsPanelComponent);
  private readonly protocols = viewChild(RmaProtocolsComponent);
  private readonly stageTimes = viewChild(RmaStageTimesComponent);
  private readonly diagnosis = viewChild(RmaDiagnosisComponent);
  /** Every folding section, including the shared panels and stage times. */
  private readonly sections = computed(() => {
    const diagnosis = this.diagnosis()?.section();
    return [
      ...this.ownSections(),
      ...(this.interventions()?.sections() ?? []),
      ...(this.partsPanel()?.sections() ?? []),
      ...[diagnosis, this.blocks()?.section(), this.protocols()?.section(), this.stageTimes()?.section()]
        .filter((section): section is CollapsibleSectionComponent => !!section)
    ];
  });
  protected chooseAssignee(assigneeId: unknown): void {
    const rma = this.rma();
    if (assigneeId !== rma.assigneeId) this.assigneeChange.emit({ rma, assigneeId: assigneeId as number | null });
  }
}
