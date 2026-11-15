import { Component, computed, inject, input } from '@angular/core';
import { RmaResponse } from '../../core/models';
import { IconComponent } from '../icon/icon.component';
import { ClockService } from '../../core/services/clock.service';
import { blockDateTime, blockDuration } from '../../core/utils/rma-block';

@Component({
  selector: 'app-rma-block-history',
  imports: [IconComponent],
  template: `
    <section class="summary-block block-history" [class.block-history--previous]="previousOnly()" [attr.aria-label]="previousOnly() ? 'Impedimentos anteriores' : 'Impedimentos da OS'">
      @if (!previousOnly()) {
        <h3>Impedimentos</h3>
        @if (rma().currentBlock; as block) {
          <div class="block-history__current">
            <strong>Impedida há {{ duration(block, clock.now()) }}</strong>
            <p>{{ block.reason }}</p>
          </div>
        } @else {
          <div class="record-empty"><span class="icon-tile tone-slate"><app-icon name="lock" /></span><p>Sem bloqueio atual.</p></div>
        }
      }
      @if (history().length === 0) {
        <div class="record-empty"><span class="icon-tile tone-slate"><app-icon name="lock" /></span><p>Nenhum impedimento registrado.</p></div>
      } @else {
        <ol class="record-rows" aria-label="Histórico de impedimentos">
          @for (block of history(); track block.id) {
            <li class="record-row" [class]="block.resolvedAt ? 'tone-success' : 'tone-warning'">
              <span class="icon-tile icon-tile--sm"><app-icon name="lock" [size]="18" /></span>
              <div class="record-row__main">
                <div class="record-row__head">
                  <strong class="record-row__title">{{ block.reason }}</strong>
                  <span class="mini-chip tone-chip">{{ block.resolvedAt ? 'Resolvido' : 'Ativo' }}</span>
                </div>
                <dl class="record-stats record-stats--compact block-history__stats">
                  @if (block.category) { <div><dt>Categoria</dt><dd>{{ block.category }}</dd></div> }
                  <div><dt>Início</dt><dd><time [attr.datetime]="block.blockedAt">{{ dateTime(block.blockedAt) }}</time></dd></div>
                  <div><dt>Bloqueado por</dt><dd>{{ block.blockedBy }}</dd></div>
                  <div><dt>Duração</dt><dd>{{ duration(block, clock.now()) }}</dd></div>
                  @if (block.resolvedAt) {
                    <div><dt>Resolvido em</dt><dd><time [attr.datetime]="block.resolvedAt">{{ dateTime(block.resolvedAt) }}</time></dd></div>
                    <div><dt>Resolvido por</dt><dd>{{ block.resolvedBy }}</dd></div>
                  }
                </dl>
                @if (block.resolvedAt && block.resolutionNote) {
                  <p class="block-history__note"><span class="block-history__note-label">Nota de resolução:</span> {{ block.resolutionNote }}</p>
                }
              </div>
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
    .block-history__stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .block-history__note { color: var(--text); font-size: var(--font-size-sm); white-space: pre-wrap; }
    .block-history__note-label { color: var(--muted); }
    @media (max-width: 720px) { .block-history__stats { grid-template-columns: minmax(0, 1fr); } }
  `]
})
export class RmaBlockHistoryComponent {
  readonly rma = input.required<RmaResponse>();
  /** Only the resolved episodes, without title, current block or hint (the detail shows those). */
  readonly previousOnly = input(false);
  protected readonly clock = inject(ClockService);
  protected readonly duration = blockDuration;
  protected readonly dateTime = blockDateTime;
  protected readonly history = computed(() => this.rma().blockHistory.filter((block) => !this.previousOnly() || block.resolvedAt !== null).sort((a, b) => Date.parse(b.blockedAt) - Date.parse(a.blockedAt) || b.id - a.id));
}
