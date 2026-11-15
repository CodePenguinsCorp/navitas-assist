import { TipDirective } from '../tip/tip.directive';
import { Component, ElementRef, EventEmitter, Output, computed, inject, input, output, signal } from '@angular/core';
import { BoardSentinelDirective } from './board-sentinel.directive';
import { ClockService } from '../../core/services/clock.service';
import { blockDuration } from '../../core/utils/rma-block';
import { stageTimeLabel } from '../../core/utils/rma-stage';
import { RmaDeadlineChipComponent } from '../rma-deadline-chip/rma-deadline-chip.component';
import { RMA_STATUS_FLOW } from '../../core/mock-data';
import { RmaBoardCardResponse, RmaStatus } from '../../core/models';
import {
  formatDate,
  initialsOf,
  ownerLabel,
  priorityChipClass,
  priorityLabel,
  boardProductSummary,
  statusLabel
} from '../../core/utils/rma-ui';

interface RmaBoardColumn {
  status: RmaStatus;
  label: string;
  items: RmaBoardCardResponse[];
}

export interface RmaBoardColumnState {
  cards: RmaBoardCardResponse[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  error: boolean;
  nextPage: number;
  generation: number;
}

@Component({
  selector: 'app-rma-kanban-board',
  imports: [TipDirective, RmaDeadlineChipComponent, BoardSentinelDirective],
  templateUrl: './rma-kanban-board.component.html',
  styleUrl: './rma-kanban-board.component.css'
})
export class RmaKanbanBoardComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly columnStates = input<Partial<Record<RmaStatus, RmaBoardColumnState>>>({});
  readonly announcement = input('');
  readonly loadMore = output<RmaStatus>();
  readonly cardReorder = output<{ rma: RmaBoardCardResponse; direction: number }>();
  protected readonly insertionBefore = signal<number | null>(null);
  readonly rmas = input<readonly RmaBoardCardResponse[]>([]);
  readonly loading = input(false);
  readonly canUpdateStatus = input(false);
  readonly boardUpdatingId = input<number | null>(null);
  readonly selectedRmaId = input<number | null>(null);
  readonly draggedRmaId = input<number | null>(null);
  readonly dragTargetStatus = input<RmaStatus | null>(null);

  @Output() readonly cardSelect = new EventEmitter<RmaBoardCardResponse>();
  protected readonly clock = inject(ClockService);
  protected readonly blockedDuration = blockDuration;
  @Output() readonly cardDragStart = new EventEmitter<{ event: DragEvent; rma: RmaBoardCardResponse }>();
  @Output() readonly cardDragEnd = new EventEmitter<void>();
  @Output() readonly columnDragOver = new EventEmitter<{ event: DragEvent; status: RmaStatus }>();
  @Output() readonly columnDragLeave = new EventEmitter<RmaStatus>();
  @Output() readonly columnDrop = new EventEmitter<{ event: DragEvent; status: RmaStatus; beforeId: number | null }>();

  protected readonly columns = computed<RmaBoardColumn[]>(() =>
    RMA_STATUS_FLOW.map((status) => ({
      status,
      label: statusLabel(status),
      items: [...this.rmas()]
        .filter((rma) => rma.status === status)
    }))
  );

  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityClass = priorityChipClass;
  protected readonly productSummary = boardProductSummary;
  protected readonly initials = initialsOf;
  protected readonly ownerLabel = ownerLabel;
  protected readonly dateLabel = formatDate;

  focusCard(id: number): boolean {
    const card = this.element.nativeElement.querySelector<HTMLElement>(`[data-rma-id="${id}"]`);
    card?.focus({ preventScroll: true });
    return !!card;
  }

  protected keyboardMove(event: KeyboardEvent, rma: RmaBoardCardResponse): void {
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || !this.canUpdateStatus() || this.boardUpdatingId() !== null) return;
    event.preventDefault();
    this.cardReorder.emit({ rma, direction: event.key === 'ArrowUp' ? -1 : 1 });
  }

  protected dragOver(event: DragEvent, status: RmaStatus): void {
    if (!this.canUpdateStatus() || this.draggedRmaId() === null || this.boardUpdatingId() !== null) return;
    const column = event.currentTarget as HTMLElement;
    const cards = [...column.querySelectorAll<HTMLElement>('[data-rma-id]')].filter(card => Number(card.dataset['rmaId']) !== this.draggedRmaId());
    const before = cards.find(card => event.clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2);
    this.insertionBefore.set(before ? Number(before.dataset['rmaId']) : null);
    this.columnDragOver.emit({ event, status });
  }

  /** "há 2 d 4 h nesta etapa" for open RMAs; null for closed ones. */
  protected stageTime(rma: RmaBoardCardResponse): string | null {
    return stageTimeLabel(rma, this.clock.now());
  }

  protected isSelected(rma: RmaBoardCardResponse): boolean {
    return this.selectedRmaId() === rma.id;
  }

  protected isDragging(rma: RmaBoardCardResponse): boolean {
    return this.draggedRmaId() === rma.id;
  }

  protected isDropTarget(status: RmaStatus): boolean {
    return this.dragTargetStatus() === status;
  }

  protected isStatusUpdating(rma: RmaBoardCardResponse): boolean {
    return this.boardUpdatingId() === rma.id;
  }
}
