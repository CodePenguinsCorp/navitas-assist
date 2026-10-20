import { Component, computed, inject, input } from '@angular/core';
import { RmaSlaResponse } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { SLA_LABELS, elapsedSlaSeconds, slaDuration, slaStatus } from '../../core/utils/rma-sla';
import { formatDateTime } from '../../core/utils/rma-ui';

@Component({
  selector: 'app-rma-sla-badge',
  templateUrl: './rma-sla-badge.component.html',
  styleUrl: './rma-sla-badge.component.css'
})
export class RmaSlaBadgeComponent {
  readonly sla = input.required<RmaSlaResponse>();
  private readonly clock = inject(SlaClockService);
  protected readonly state = computed(() => slaStatus(this.sla(), this.clock.now()));
  protected readonly elapsed = computed(() => slaDuration(elapsedSlaSeconds(this.sla(), this.clock.now())));
  protected readonly labels = SLA_LABELS;
  protected readonly duration = slaDuration;
  protected readonly dateTime = formatDateTime;
}
