import { Component, EventEmitter, Output, computed, input } from '@angular/core';
import { RmaSlaBadgeComponent } from '../rma-sla-badge/rma-sla-badge.component';
import { RMA_STATUS_FLOW } from '../../core/mock-data';
import { KanbanGroupBy, RmaResponse, RmaStatus } from '../../core/models';
import { groupKanbanLanes } from '../../core/utils/kanban-lanes';
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

@Component({
  selector: 'app-rma-kanban-board',
  imports: [RmaSlaBadgeComponent],
  templateUrl: './rma-kanban-board.component.html',
  styleUrl: './rma-kanban-board.component.css'
})
export class RmaKanbanBoardComponent {
  readonly groupBy = input<KanbanGroupBy>('NONE');
  readonly descendingLanes = input(false);
  readonly emptyLanesFirst = input(false);
  readonly collapsedLaneKeys = input<readonly string[]>([]);
  @Output() readonly laneToggle = new EventEmitter<string>();
  readonly rmas = input<readonly RmaResponse[]>([]);
  readonly bulkSelectionEnabled = input(false);
  readonly bulkSelectedIds = input<readonly number[]>([]);
  readonly interactionDisabled = input(false);
  @Output() readonly bulkSelectionChange = new EventEmitter<RmaResponse>();
  readonly loading = input(false);
  readonly canUpdateStatus = input(false);
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

  protected readonly totalRmas = computed(() => this.rmas().length);
  protected readonly lanes = computed(() =>
    groupKanbanLanes(this.rmas(), this.groupBy(), this.descendingLanes(), this.emptyLanesFirst()).map(lane => ({
      ...lane, columns: RMA_STATUS_FLOW.map((status): RmaBoardColumn => ({
      status,
      label: statusLabel(status),
      items: [...lane.items]
        .filter((rma) => rma.status === status)
        .sort(compareRmasForBoard)
      }))
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
}
