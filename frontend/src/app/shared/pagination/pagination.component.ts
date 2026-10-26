import { Component, computed, input, output } from '@angular/core';
import { PAGE_SIZE_OPTIONS, pageRange } from '../../core/utils/pagination';

@Component({
  selector: 'app-pagination',
  template: `
    <nav class="pagination" aria-label="Paginação">
      <span class="pagination__summary" aria-live="polite">
        {{ range() }} registro(s)
      </span>
      <label class="pagination__size">
        <span>Por página</span>
        <select [value]="size()" (change)="changeSize($event)" aria-label="Registros por página">
          @for (option of sizeOptions; track option) {
            <option [value]="option" [selected]="option === size()">{{ option }}</option>
          }
        </select>
      </label>
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
    .pagination__size select { min-height: 34px; padding: 0 0.5rem; border: 1px solid var(--line); border-radius: 8px; background: #ffffff; color: var(--brand-blue-deep); }
    .pagination__controls { display: inline-flex; align-items: center; gap: 0.75rem; }
  `]
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly size = input.required<number>();
  readonly totalElements = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly shown = input.required<number>();
  readonly loading = input(false);

  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();

  protected readonly sizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly range = computed(() => pageRange(this.page(), this.size(), this.totalElements(), this.shown()));
  protected readonly displayPage = computed(() => Math.min(this.page() + 1, Math.max(this.totalPages(), 1)));
  protected readonly displayTotalPages = computed(() => Math.max(this.totalPages(), 1));
  protected readonly hasPrevious = computed(() => this.page() > 0);
  protected readonly hasNext = computed(() => this.page() + 1 < this.totalPages());

  protected changeSize(event: Event): void {
    this.sizeChange.emit(Number((event.target as HTMLSelectElement).value));
  }
}
