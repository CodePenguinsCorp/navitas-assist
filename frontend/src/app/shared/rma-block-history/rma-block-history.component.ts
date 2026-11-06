import { Component, computed, inject, input } from '@angular/core';
import { RmaResponse } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { blockDateTime, blockDuration } from '../../core/utils/rma-block';

@Component({
  selector: 'app-rma-block-history',
  template: `
    <section class="summary-block block-history" aria-label="Impedimentos do RMA">
      <h3>Impedimentos</h3>
      @if (rma().currentBlock; as block) {
        <div class="block-history__current">
          <strong>Bloqueado há {{ duration(block, clock.now()) }}</strong>
          <p>{{ block.reason }}</p>
        </div>
      } @else {
        <p class="block-history__state">Sem bloqueio atual.</p>
      }
      <p class="block-history__hint">O período bloqueado continua contando no SLA.</p>
      @if (history().length === 0) {
        <p class="block-history__state">Nenhum impedimento registrado.</p>
      } @else {
        <ol class="record-list">
          @for (block of history(); track block.id) {
            <li class="record-card">
              <div class="record-card__title">
                <span class="mini-chip" [class.priority-high]="!block.resolvedAt" [class.warranty-ok]="!!block.resolvedAt">{{ block.resolvedAt ? 'Resolvido' : 'Bloqueado' }}</span>
                <strong>{{ block.category || 'Sem categoria' }}</strong>
                <time>{{ dateTime(block.blockedAt) }}</time>
              </div>
              <p>{{ block.reason }}</p>
              <dl class="meta-list">
                <div><dt>Bloqueado por</dt><dd>{{ block.blockedBy }}</dd></div>
                @if (block.resolvedAt) {
                  <div><dt>Resolvido em</dt><dd>{{ dateTime(block.resolvedAt) }}</dd></div>
                  <div><dt>Resolvido por</dt><dd>{{ block.resolvedBy }}</dd></div>
                  <div><dt>Tempo bloqueado</dt><dd>{{ duration(block, clock.now()) }}</dd></div>
                }
              </dl>
              @if (block.resolutionNote) {
                <p class="block-history__hint">{{ block.resolutionNote }}</p>
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [`
    .block-history { display: grid; gap: 0.75rem; }
    .block-history h3 { margin: 0; font-size: 1rem; }
    .block-history p { margin: 0; }
    .block-history__current { display: grid; gap: 0.2rem; padding: 0.7rem 0.85rem; border-radius: var(--radius-sm); background: var(--danger-bg); color: var(--danger-text); }
    .block-history__state { color: var(--text); }
    .block-history__hint { color: var(--muted); font-size: 0.88rem; }
  `]
})
export class RmaBlockHistoryComponent {
  readonly rma = input.required<RmaResponse>();
  protected readonly clock = inject(SlaClockService);
  protected readonly duration = blockDuration;
  protected readonly dateTime = blockDateTime;
  protected readonly history = computed(() => [...this.rma().blockHistory].sort((a, b) => Date.parse(b.blockedAt) - Date.parse(a.blockedAt) || b.id - a.id));
}
