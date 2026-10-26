import { HttpParams } from '@angular/common/http';
import { PageQuery } from '../models';

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS: ReadonlyArray<number> = [10, 20, 50, 100];

export function buildPageParams(
  pageQuery: PageQuery,
  filters: Record<string, string | boolean | undefined>
): HttpParams {
  let params = new HttpParams();

  if (pageQuery.page !== undefined) {
    params = params.set('page', pageQuery.page);
  }

  if (pageQuery.size !== undefined) {
    params = params.set('size', pageQuery.size);
  }

  for (const [name, value] of Object.entries(filters)) {
    const normalized = typeof value === 'string' ? value.trim() : value;

    if (normalized !== undefined && normalized !== '') {
      params = params.set(name, normalized);
    }
  }

  return params;
}

export function presenceToFlag(filter: 'all' | 'with' | 'without'): boolean | undefined {
  return filter === 'all' ? undefined : filter === 'with';
}

export function pageRange(page: number, size: number, totalElements: number, shown: number): string {
  if (totalElements === 0 || shown === 0) {
    return '0 de 0';
  }

  const first = page * size + 1;
  return `${first}–${first + shown - 1} de ${totalElements}`;
}

export const SEARCH_DEBOUNCE_MS = 300;
