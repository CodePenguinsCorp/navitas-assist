import { Component, computed, inject, input } from '@angular/core';
import { RmaResponse } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { blockDateTime, blockDuration } from '../../core/utils/rma-block';

@Component({
  selector: 'app-rma-block-history',
  template: `
    <section class="summary-block" aria-label="Impedimentos do RMA">
      <h3>Impedimentos</h3>
      @if (rma().currentBlock; as block) {
        <p><strong>Bloqueado há {{ duration(block, clock.now()) }}</strong>: {{ block.reason }}</p>
      } @else { <p>Sem bloqueio atual.</p> }
      <p>O período bloqueado continua contando no SLA.</p>
      @if (history().length === 0) { <p>Nenhum impedimento registrado.</p> }
      @for (block of history(); track block.id) {
        <article class="summary-block">
          <strong>{{ block.resolvedAt ? 'Resolvido' : 'Bloqueado' }} · {{ block.category || 'Sem categoria' }}</strong>
          <p>{{ block.reason }}</p>
          <p>Início: {{ dateTime(block.blockedAt) }} · {{ block.blockedBy }}</p>
          @if (block.resolvedAt) {
            <p>Resolução: {{ dateTime(block.resolvedAt) }} · {{ block.resolvedBy }}</p>
            <p>{{ block.resolutionNote }}</p>
            <small>Tempo bloqueado: {{ duration(block, clock.now()) }}</small>
          }
        </article>
      }
    </section>
  `,
})
export class RmaBlockHistoryComponent {
  readonly rma = input.required<RmaResponse>();
  protected readonly clock = inject(SlaClockService);
  protected readonly duration = blockDuration;
  protected readonly dateTime = blockDateTime;
  protected readonly history = computed(() => [...this.rma().blockHistory].sort((a, b) => Date.parse(b.blockedAt) - Date.parse(a.blockedAt) || b.id - a.id));
}
