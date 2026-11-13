import { Component, computed, inject, input } from '@angular/core';
import { RmaResponse } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { businessToday, deadlineCardLabel, deadlineDetailLabel, deadlineStatus } from '../../core/utils/rma-deadline';

/**
 * Due date situation as a text chip. In `card` mode it only shows when the RMA is overdue or close to the due date;
 * in `detail` mode it always shows the situation. Recomputed on every tick of the shared clock.
 */
@Component({
  selector: 'app-rma-deadline-chip',
  templateUrl: './rma-deadline-chip.component.html',
  styleUrl: './rma-deadline-chip.component.css'
})
export class RmaDeadlineChipComponent {
  readonly rma = input.required<Pick<RmaResponse, 'status' | 'dueDate' | 'deadline'>>();
  readonly mode = input<'card' | 'detail'>('card');
  private readonly clock = inject(SlaClockService);
  private readonly today = computed(() => businessToday(this.clock.now()));
  protected readonly status = computed(() => deadlineStatus(this.rma(), this.today()));
  protected readonly label = computed(() => this.mode() === 'card'
    ? deadlineCardLabel(this.rma(), this.today())
    : deadlineDetailLabel(this.rma(), this.today()));
}
