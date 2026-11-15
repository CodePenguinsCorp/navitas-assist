import { Component, computed, inject, input } from '@angular/core';
import { RmaResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { businessToday, deadlineCardLabel, deadlineDetailLabel, deadlineStatus } from '../../core/utils/rma-deadline';
import { IconComponent } from '../icon/icon.component';

/**
 * Prazo das OS abertas, recalculado pelo relógio do negócio.
 * No cartão, inclui a data civil sem conversão pelo fuso do navegador.
 */
@Component({
  selector: 'app-rma-deadline-chip',
  imports: [IconComponent],
  templateUrl: './rma-deadline-chip.component.html',
  styleUrl: './rma-deadline-chip.component.css'
})
export class RmaDeadlineChipComponent {
  readonly rma = input.required<Pick<RmaResponse, 'status' | 'dueDate' | 'deadline'>>();
  readonly mode = input<'card' | 'detail'>('card');
  private readonly clock = inject(ClockService);
  private readonly today = computed(() => businessToday(this.clock.now()));
  protected readonly status = computed(() => deadlineStatus(this.rma(), this.today()));
  protected readonly label = computed(() => {
    if (this.status() === 'CLOSED') return null;
    if (this.mode() === 'detail') return deadlineDetailLabel(this.rma(), this.today());
    const dueDate = this.rma().dueDate;
    if (!dueDate) return null;
    const [year, month, day] = dueDate.split('-');
    const date = `${day}/${month}${year === this.today().slice(0, 4) ? '' : `/${year}`}`;
    const situation = deadlineCardLabel(this.rma(), this.today());
    return situation ? `${situation} (${date})` : `Prazo ${date}`;
  });
}
