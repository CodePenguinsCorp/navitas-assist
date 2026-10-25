import { DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, finalize, of, switchMap, tap } from 'rxjs';
import { PageQuery, PageResponse } from '../models';
import { DEFAULT_PAGE_SIZE } from './pagination';

export class PagedList<T> {
  readonly page = signal(0);
  readonly size = signal(DEFAULT_PAGE_SIZE);
  readonly loading = signal(true);
  readonly result = signal<PageResponse<T> | null>(null);
  readonly items = computed(() => this.result()?.content ?? []);
  readonly totalElements = computed(() => this.result()?.totalElements ?? 0);
  readonly totalPages = computed(() => this.result()?.totalPages ?? 0);

  private readonly reload$ = new Subject<void>();

  constructor(
    private readonly fetch: (query: Required<PageQuery>) => Observable<PageResponse<T>>,
    private readonly onError: (error: unknown) => void,
    private readonly onLoaded: (items: T[]) => void = () => undefined,
    destroyRef: DestroyRef = inject(DestroyRef)
  ) {
    this.reload$.pipe(
      switchMap(() => {
        this.loading.set(true);
        return this.fetch({ page: this.page(), size: this.size() }).pipe(
          tap((result) => this.apply(result)),
          catchError((error) => {
            this.onError(error);
            return of(null);
          }),
          finalize(() => this.loading.set(false))
        );
      }),
      takeUntilDestroyed(destroyRef)
    ).subscribe();
  }

  reload(): void {
    this.reload$.next();
  }

  firstPage(): void {
    this.page.set(0);
    this.reload();
  }

  goToPage(page: number): void {
    this.page.set(Math.max(page, 0));
    this.reload();
  }

  changeSize(size: number): void {
    this.size.set(size);
    this.firstPage();
  }

  private apply(result: PageResponse<T>): void {
    if (result.content.length === 0 && result.page > 0 && result.totalPages > 0) {
      this.page.set(result.totalPages - 1);
      this.reload();
      return;
    }

    this.result.set(result);
    this.onLoaded(result.content);
  }
}
