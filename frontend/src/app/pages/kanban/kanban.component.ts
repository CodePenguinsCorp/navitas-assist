import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  CLOSED_RMA_STATUSES,
  RMA_STATUS_FLOW,
  RMA_STATUS_LABELS
} from '../../core/mock-data';
import { RmaResponse, RmaStatus, RmaStatusUpdateRequest } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { normalizeText } from '../../core/utils/rma-ui';
import {
  CustomSelectComponent,
  CustomSelectOption
} from '../../shared/form-controls/custom-select/custom-select.component';
import { RmaKanbanBoardComponent } from '../../shared/rma-kanban-board/rma-kanban-board.component';

interface KanbanHeroStat {
  label: string;
  value: string;
  detail: string;
}

@Component({
  selector: 'app-kanban',
  imports: [ReactiveFormsModule, CustomSelectComponent, RmaKanbanBoardComponent],
  templateUrl: './kanban.component.html',
  styleUrl: './kanban.component.css'
})
export class KanbanComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly rmaService = inject(RmaService);

  protected readonly loading = signal(true);
  protected readonly pageError = signal('');
  protected readonly statusModalError = signal('');
  protected readonly boardUpdatingId = signal<number | null>(null);
  protected readonly draggedRmaId = signal<number | null>(null);
  protected readonly dragTargetStatus = signal<RmaStatus | null>(null);
  protected readonly selectedRmaId = signal<number | null>(null);

  private readonly rmasSignal = signal<RmaResponse[]>([]);
  private readonly pendingStatusRmaSignal = signal<RmaResponse | null>(null);

  protected readonly rmas = this.rmasSignal.asReadonly();
  protected readonly pendingStatusRma = this.pendingStatusRmaSignal.asReadonly();
  protected readonly statusSelectOptions = STATUS_SELECT_OPTIONS;
  protected readonly canUpdateStatus = computed(() =>
    this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN'])
  );
  protected readonly activeCount = computed(() =>
    this.rmasSignal().filter((rma) => !CLOSED_RMA_STATUSES.includes(rma.status)).length
  );
  protected readonly highPriorityCount = computed(() =>
    this.rmasSignal().filter((rma) => rma.priority === 'HIGH').length
  );
  protected readonly waitingPartCount = computed(() =>
    this.rmasSignal().filter((rma) => rma.status === 'WAITING_PART').length
  );
  protected readonly closedCount = computed(() =>
    this.rmasSignal().filter((rma) => CLOSED_RMA_STATUSES.includes(rma.status)).length
  );
  protected readonly heroStats = computed<ReadonlyArray<KanbanHeroStat>>(() => [
    {
      label: 'Em andamento',
      value: String(this.activeCount()),
      detail: 'Cards ativos no fluxo'
    },
    {
      label: 'Alta prioridade',
      value: String(this.highPriorityCount()),
      detail: 'Itens que exigem atenção'
    },
    {
      label: 'Aguardando peça',
      value: String(this.waitingPartCount()),
      detail: 'Possível gargalo atual'
    },
    {
      label: 'Encerrados',
      value: String(this.closedCount()),
      detail: 'Concluídos ou devolvidos'
    }
  ]);

  protected readonly statusForm = this.formBuilder.nonNullable.group({
    status: ['RECEIVED' as RmaStatus, [Validators.required]],
    note: ['']
  });

  constructor() {
    this.loadKanban();
  }

  protected selectRma(rma: RmaResponse): void {
    this.selectedRmaId.set(rma.id);
    this.pageError.set('');
  }

  protected startCardDrag(event: DragEvent, rma: RmaResponse): void {
    if (!this.canUpdateStatus() || this.boardUpdatingId() !== null) {
      event.preventDefault();
      return;
    }

    this.draggedRmaId.set(rma.id);
    this.dragTargetStatus.set(null);
    this.selectRma(rma);

    event.dataTransfer?.setData('text/plain', String(rma.id));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  protected endCardDrag(): void {
    if (this.boardUpdatingId() === null) {
      this.clearBoardDragState();
    }
  }

  protected allowColumnDrop(event: DragEvent, status: RmaStatus): void {
    if (!this.canUpdateStatus() || this.boardUpdatingId() !== null || this.draggedRmaId() === null) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    this.dragTargetStatus.set(status);
  }

  protected leaveColumn(status: RmaStatus): void {
    if (this.dragTargetStatus() === status) {
      this.dragTargetStatus.set(null);
    }
  }

  protected dropOnColumn(event: DragEvent, status: RmaStatus): void {
    event.preventDefault();

    if (!this.canUpdateStatus() || this.boardUpdatingId() !== null) {
      this.clearBoardDragState();
      return;
    }

    const draggedId = this.draggedRmaId();
    const dragged = this.rmasSignal().find((item) => item.id === draggedId);
    if (!dragged) {
      this.clearBoardDragState();
      return;
    }

    if (dragged.status === status) {
      this.selectRma(dragged);
      this.clearBoardDragState();
      return;
    }

    this.openStatusModal(dragged, status);
    this.clearBoardDragState();
  }

  protected closeStatusModal(): void {
    if (this.boardUpdatingId() !== null) {
      return;
    }

    this.pendingStatusRmaSignal.set(null);
    this.statusModalError.set('');
    this.clearBoardDragState();
  }

  protected saveStatusChange(): void {
    const target = this.pendingStatusRmaSignal();
    if (!target) {
      return;
    }

    if (this.statusForm.invalid) {
      this.statusForm.markAllAsTouched();
      this.statusModalError.set('Informe um status válido.');
      return;
    }

    const raw = this.statusForm.getRawValue();
    if (raw.status === target.status) {
      this.statusModalError.set('Escolha uma fase diferente da atual.');
      return;
    }

    this.submitStatusUpdate(target, {
      status: raw.status,
      note: normalizeText(raw.note)
    });
  }

  private loadKanban(): void {
    this.loading.set(true);
    this.pageError.set('');

    this.rmaService.list().pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (rmas) => {
        this.rmasSignal.set(rmas);
        this.syncSelection(rmas);
      },
      error: (error) => {
        this.pageError.set(extractHttpErrorMessage(error, 'Não foi possível carregar o Kanban.'));
      }
    });
  }

  private syncSelection(rmas: RmaResponse[]): void {
    const selectedId = this.selectedRmaId();
    if (selectedId === null) {
      return;
    }

    const refreshed = rmas.find((item) => item.id === selectedId);
    if (!refreshed) {
      this.selectedRmaId.set(null);
    }
  }

  private openStatusModal(rma: RmaResponse, status: RmaStatus): void {
    this.pendingStatusRmaSignal.set(rma);
    this.statusModalError.set('');
    this.statusForm.reset({
      status,
      note: ''
    });
  }

  private submitStatusUpdate(target: RmaResponse, payload: RmaStatusUpdateRequest): void {
    this.boardUpdatingId.set(target.id);
    this.pageError.set('');
    this.statusModalError.set('');

    this.rmaService.updateStatus(target.id, payload).pipe(
      finalize(() => this.boardUpdatingId.set(null))
    ).subscribe({
      next: (updated) => {
        this.selectedRmaId.set(updated.id);
        this.pendingStatusRmaSignal.set(null);
        this.loadKanban();
      },
      error: (error) => {
        this.statusModalError.set(
          extractHttpErrorMessage(error, 'Não foi possível atualizar o status do RMA.')
        );
      }
    });
  }

  private clearBoardDragState(): void {
    this.draggedRmaId.set(null);
    this.dragTargetStatus.set(null);
  }
}

const STATUS_SELECT_OPTIONS: ReadonlyArray<CustomSelectOption<RmaStatus>> = RMA_STATUS_FLOW.map((status) => ({
  value: status,
  label: RMA_STATUS_LABELS[status]
}));
