import { Component, EventEmitter, Output, computed, input, signal } from '@angular/core';
import { RmaSlaBadgeComponent } from '../rma-sla-badge/rma-sla-badge.component';
import { RMA_STATUS_FLOW } from '../../core/mock-data';
import { RmaResponse, RmaStatus } from '../../core/models';
import {
  compareRmasForBoard,
  formatDate,
  ownerLabel,
  priorityChipClass,
  priorityLabel,
  productSummary,
  statusLabel,
  trackableLabel,
  warrantyClass,
  warrantyLabel
} from '../../core/utils/rma-ui';

interface RmaBoardColumn {
  status: RmaStatus;
  label: string;
  items: RmaResponse[];
}

export interface RmaCardReorder {
  rma: RmaResponse;
  anchorId: number;
  after: boolean;
}

@Component({
  selector: 'app-rma-kanban-board',
  imports: [RmaSlaBadgeComponent],
  templateUrl: './rma-kanban-board.component.html',
  styleUrl: './rma-kanban-board.component.css'
})
export class RmaKanbanBoardComponent {
  readonly rmas = input<readonly RmaResponse[]>([]);
  readonly bulkSelectionEnabled = input(false);
  readonly bulkSelectedIds = input<readonly number[]>([]);
  readonly interactionDisabled = input(false);
  @Output() readonly bulkSelectionChange = new EventEmitter<RmaResponse>();
  readonly loading = input(false);
  readonly canUpdateStatus = input(false);
  readonly canReorder = input(false);
  readonly canUpdateAssignee = input(false);
  readonly boardUpdatingId = input<number | null>(null);
  readonly selectedRmaId = input<number | null>(null);
  readonly draggedRmaId = input<number | null>(null);
  readonly dragTargetStatus = input<RmaStatus | null>(null);
  readonly showToolbar = input(true);
  readonly toolbarTitle = input('Quadro Kanban');
  readonly toolbarDescription = input('Arraste os cards entre as colunas para atualizar o status do RMA.');

  @Output() readonly cardSelect = new EventEmitter<RmaResponse>();
  @Output() readonly assigneeChange = new EventEmitter<RmaResponse>();
  @Output() readonly cardDragStart = new EventEmitter<{ event: DragEvent; rma: RmaResponse }>();
  @Output() readonly cardDragEnd = new EventEmitter<void>();
  @Output() readonly columnDragOver = new EventEmitter<{ event: DragEvent; status: RmaStatus }>();
  @Output() readonly columnDragLeave = new EventEmitter<RmaStatus>();
  @Output() readonly columnDrop = new EventEmitter<{ event: DragEvent; status: RmaStatus }>();
  @Output() readonly cardReorder = new EventEmitter<RmaCardReorder>();

  protected readonly dropPlacement = signal<{ id: number; after: boolean } | null>(null);

  protected readonly totalRmas = computed(() => this.rmas().length);
  protected readonly columns = computed<RmaBoardColumn[]>(() =>
    RMA_STATUS_FLOW.map((status) => ({
      status,
      label: statusLabel(status),
      items: [...this.rmas()]
        .filter((rma) => rma.status === status)
        .sort(compareRmasForBoard)
    }))
  );

  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityClass = priorityChipClass;
  protected readonly productSummary = productSummary;
  protected readonly warrantyLabel = warrantyLabel;
  protected readonly warrantyClass = warrantyClass;
  protected readonly trackableLabel = trackableLabel;
  protected readonly ownerLabel = ownerLabel;
  protected readonly dateLabel = formatDate;

  protected isSelected(rma: RmaResponse): boolean {
    return this.selectedRmaId() === rma.id || this.bulkSelectedIds().includes(rma.id);
  }

  protected isDragging(rma: RmaResponse): boolean {
    return this.draggedRmaId() === rma.id;
  }

  protected isDropTarget(status: RmaStatus): boolean {
    return this.dragTargetStatus() === status;
  }

  protected isStatusUpdating(rma: RmaResponse): boolean {
    return this.boardUpdatingId() === rma.id;
  }

  protected requestAssigneeChange(event: Event, rma: RmaResponse): void {
    event.preventDefault();
    event.stopPropagation();
    this.assigneeChange.emit(rma);
  }

  protected preventCardDrag(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  protected requestReorder(event: Event, rma: RmaResponse, anchor: RmaResponse | undefined, after: boolean): void {
    event.preventDefault();
    event.stopPropagation();
    if (!anchor || !this.canReorder() || this.interactionDisabled() || this.boardUpdatingId() !== null) return;
    this.cardReorder.emit({ rma, anchorId: anchor.id, after });
  }

  protected allowCardDrop(event: DragEvent, target: RmaResponse): void {
    if (!this.canDropOnCard(target)) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dropPlacement.set({ id: target.id, after: event.clientY > bounds.top + bounds.height / 2 });
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  protected dropOnCard(event: DragEvent, target: RmaResponse): void {
    if (this.draggedRmaId() === target.id) {
      event.preventDefault();
      event.stopPropagation();
      this.endDrag();
      return;
    }
    if (!this.canDropOnCard(target)) return;
    const dragged = this.rmas().find((rma) => rma.id === this.draggedRmaId())!;
    this.requestReorder(event, dragged, target, this.dropPlacement()?.id === target.id && this.dropPlacement()?.after === true);
    this.endDrag();
  }

  protected endDrag(): void {
    this.dropPlacement.set(null);
    this.cardDragEnd.emit();
  }

  private canDropOnCard(target: RmaResponse): boolean {
    const dragged = this.rmas().find((rma) => rma.id === this.draggedRmaId());
    return this.canReorder() && !this.interactionDisabled() && this.boardUpdatingId() === null
      && dragged?.status === target.status && dragged.id !== target.id;
  }
}
