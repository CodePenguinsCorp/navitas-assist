import { Component, computed, input, output } from '@angular/core';
import { PAGE_SIZE_OPTIONS, pageRange } from '../../core/utils/pagination';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';

@Component({
  selector: 'app-pagination',
  imports: [CustomSelectComponent],
  template: `
    <nav class="pagination" aria-label="Paginação">
      <span class="pagination__summary" aria-live="polite">
        {{ range() }} {{ totalElements() === 1 ? singular() : plural() }}
      </span>
      <div class="pagination__size">
        <span>Por página</span>
        <app-custom-select size="compact" ariaLabel="Registros por página" [options]="sizeSelectOptions" [value]="size()" (valueChange)="sizeChange.emit($any($event))" />
      </div>
      <div class="pagination__controls">
        <button type="button" class="button-secondary button-secondary--small" [disabled]="!hasPrevious() || loading()" (click)="pageChange.emit(page() - 1)">
          Anterior
        </button>
        <span class="pagination__position">Página {{ displayPage() }} de {{ displayTotalPages() }}</span>
        <button type="button" class="button-secondary button-secondary--small" [disabled]="!hasNext() || loading()" (click)="pageChange.emit(page() + 1)">
          Próxima
        </button>
      </div>
    </nav>
  `,
  styles: [`
    :host { display: block; }
    .pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem 1.25rem; padding-top: 1rem; color: var(--muted); font-size: 0.92rem; }
    .pagination__size { display: inline-flex; align-items: center; gap: 0.5rem; }
    .pagination__controls { display: inline-flex; align-items: center; gap: 0.75rem; }
    /* Beside the 64px menu rail a 320px screen leaves ~224px: the page buttons wrap instead of widening the page. */
    @media (max-width: 480px) { .pagination__controls { flex-wrap: wrap; } }
  `]
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly size = input.required<number>();
  readonly totalElements = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly shown = input.required<number>();
  readonly loading = input(false);
  /** Entity names for the total; the singular only applies to exactly one record. */
  readonly singular = input('registro');
  readonly plural = input('registros');

  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();

  protected readonly sizeSelectOptions = PAGE_SIZE_OPTIONS.map((option) => ({ value: option, label: String(option) }));
  protected readonly range = computed(() => pageRange(this.page(), this.size(), this.totalElements(), this.shown()));
  protected readonly displayPage = computed(() => Math.min(this.page() + 1, Math.max(this.totalPages(), 1)));
  protected readonly displayTotalPages = computed(() => Math.max(this.totalPages(), 1));
  protected readonly hasPrevious = computed(() => this.page() > 0);
  protected readonly hasNext = computed(() => this.page() + 1 < this.totalPages());

}
