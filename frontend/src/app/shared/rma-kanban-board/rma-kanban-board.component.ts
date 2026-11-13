import { Component, EventEmitter, Output, computed, inject, input } from '@angular/core';
import { ClockService } from '../../core/services/clock.service';
import { blockDuration } from '../../core/utils/rma-block';
import { stageTimeLabel } from '../../core/utils/rma-stage';
import { RmaDeadlineChipComponent } from '../rma-deadline-chip/rma-deadline-chip.component';
import { RMA_STATUS_FLOW } from '../../core/mock-data';
import { RmaResponse, RmaStatus } from '../../core/models';
import {
  compareRmasForBoard,
  formatDate,
  initialsOf,
  ownerLabel,
  priorityChipClass,
  priorityLabel,
  productSummary,
  statusLabel
} from '../../core/utils/rma-ui';

interface RmaBoardColumn {
  status: RmaStatus;
  label: string;
  items: RmaResponse[];
}

@Component({
  selector: 'app-rma-kanban-board',
  imports: [RmaDeadlineChipComponent],
  templateUrl: './rma-kanban-board.component.html',
  styleUrl: './rma-kanban-board.component.css'
})
export class RmaKanbanBoardComponent {
  readonly rmas = input<readonly RmaResponse[]>([]);
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
  protected readonly clock = inject(ClockService);
  protected readonly blockedDuration = blockDuration;
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
  protected readonly productSummary = productSummary;
  protected readonly initials = initialsOf;
  protected readonly ownerLabel = ownerLabel;
  protected readonly dateLabel = formatDate;

  /** "há 2 d 4 h nesta etapa" for open RMAs; null for closed ones. */
  protected stageTime(rma: RmaResponse): string | null {
    return stageTimeLabel(rma, this.clock.now());
  }

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
