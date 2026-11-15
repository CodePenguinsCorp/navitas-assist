import { DestroyRef } from '@angular/core';
import { of } from 'rxjs';
import { PageQuery, PageResponse } from '../models';
import { PagedList } from './paged-list';

const page = (overrides: Partial<PageResponse<string>>): PageResponse<string> => ({ content: [], page: 0, size: 10, totalElements: 0, totalPages: 0, ...overrides });
const destroyRef = { onDestroy: () => () => undefined } as unknown as DestroyRef;

describe('PagedList', () => {
  it('falls back to the first page, without another request, when the total becomes zero', () => {
    const queries: Array<Required<PageQuery>> = [];
    const list = new PagedList<string>((query) => { queries.push(query); return of(page({ page: query.page })); }, () => undefined, () => undefined, destroyRef);
    list.goToPage(3);
    expect(queries).toEqual([{ page: 3, size: list.size() }]);
    expect(list.page()).toBe(0);
    expect(list.items()).toEqual([]);
    expect(list.totalPages()).toBe(0);
  });

  it('goes back to the last page once, without looping, when the page is past the end', () => {
    const queries: number[] = [];
    const list = new PagedList<string>((query) => {
      queries.push(query.page);
      return of(query.page >= 2 ? page({ page: query.page, totalElements: 20, totalPages: 2 }) : page({ page: query.page, content: ['a'], totalElements: 20, totalPages: 2 }));
    }, () => undefined, () => undefined, destroyRef);
    list.goToPage(5);
    expect(queries).toEqual([5, 1]);
    expect(list.page()).toBe(1);
    expect(list.items()).toEqual(['a']);
  });
});
