import { Component, EventEmitter, Output, computed, input } from '@angular/core';
import { RMA_STATUS_FLOW } from '../../core/mock-data';
import { RmaResponse, RmaStatus } from '../../core/models';
import {
  compareRmasForBoard,
  formatDate,
  ownerLabel,
  priorityChipClass,
  priorityLabel,
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
  templateUrl: './rma-kanban-board.component.html',
  styleUrl: './rma-kanban-board.component.css'
})
export class RmaKanbanBoardComponent {
  readonly rmas = input<readonly RmaResponse[]>([]);
  readonly loading = input(false);
  readonly canUpdateStatus = input(false);
  readonly boardUpdatingId = input<number | null>(null);
  readonly selectedRmaId = input<number | null>(null);
  readonly draggedRmaId = input<number | null>(null);
  readonly dragTargetStatus = input<RmaStatus | null>(null);
  readonly showToolbar = input(true);
  readonly toolbarTitle = input('Quadro Kanban');
  readonly toolbarDescription = input('Arraste os cards entre as colunas para atualizar o status do RMA.');

  @Output() readonly cardSelect = new EventEmitter<RmaResponse>();
  @Output() readonly cardDragStart = new EventEmitter<{ event: DragEvent; rma: RmaResponse }>();
  @Output() readonly cardDragEnd = new EventEmitter<void>();
  @Output() readonly columnDragOver = new EventEmitter<{ event: DragEvent; status: RmaStatus }>();
  @Output() readonly columnDragLeave = new EventEmitter<RmaStatus>();
  @Output() readonly columnDrop = new EventEmitter<{ event: DragEvent; status: RmaStatus }>();

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
  protected readonly warrantyLabel = warrantyLabel;
  protected readonly warrantyClass = warrantyClass;
  protected readonly trackableLabel = trackableLabel;
  protected readonly ownerLabel = ownerLabel;
  protected readonly dateLabel = formatDate;

  protected isSelected(rma: RmaResponse): boolean {
    return this.selectedRmaId() === rma.id;
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
}
