import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AssignableUserResponse, RmaResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { KanbanViewService } from '../../core/services/kanban-view.service';
import { RmaService } from '../../core/services/rma.service';
import { ClockService } from '../../core/services/clock.service';
import { buildRma } from '../../testing/rma-fixtures';
import { KanbanComponent } from './kanban.component';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';

interface StatesHarness {
  filtersForm: FormGroup;
}

const FIRST = buildRma({ id: 1, code: 'OS-2026-000001', priority: 'HIGH' });
const SECOND = buildRma({ id: 2, code: 'OS-2026-000002', priority: 'LOW' });

describe('KanbanComponent reading states and count', () => {
  let fixture: ComponentFixture<KanbanComponent>;
  let page: HTMLElement;
  let boards: Subject<RmaResponse[]>[];
  let users: Subject<AssignableUserResponse[]>[];

  beforeEach(async () => {
    boards = [];
    users = [];
    await TestBed.configureTestingModule({
      imports: [KanbanComponent],
      providers: [
        provideRouter([]),
        { provide: ClockService, useValue: { now: signal(Date.parse('2026-10-20T12:00:00Z')) } },
        providePermissions(profilePermissions('ADMIN')),
        { provide: CatalogService, useValue: { listAssignableUsers: () => { const source = new Subject<AssignableUserResponse[]>(); users.push(source); return source; } } },
        { provide: KanbanViewService, useValue: { list: () => of([]) } },
        { provide: RmaService, useValue: { listBoard: () => { const source = new Subject<RmaResponse[]>(); boards.push(source); return source; } } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(KanbanComponent);
    page = fixture.nativeElement as HTMLElement;
    render();
  });

  function render(): void {
    fixture.detectChanges();
  }

  function respond(index: number, rmas: RmaResponse[]): void {
    boards[index].next(rmas);
    boards[index].complete();
    users[index].next([]);
    users[index].complete();
    render();
  }

  function fail(index: number, source: 'board' | 'users' = 'board'): void {
    const error = new HttpErrorResponse({ status: 500, error: { message: 'Servidor indisponível' } });
    if (source === 'board') boards[index].error(error);
    else users[index].error(error);
    render();
  }

  const text = () => (page.textContent ?? '').replace(/\s+/g, ' ');
  const summary = () => page.querySelector<HTMLElement>('.page-summary');
  const firstIndicator = () => summary()?.querySelector('li')?.textContent?.replace(/\s+/g, ' ').trim();
  const retryButton = () => [...page.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'Tentar novamente');
  const filters = () => (fixture.componentInstance as unknown as StatesHarness).filtersForm;

  it('uses the shared page header without the old count or a result counter', () => {
    expect(page.querySelector('app-page-header h1')?.textContent?.trim()).toBe('Kanban de ordens de serviço');
    expect(page.querySelector('.kanban-heading__count')).toBeNull();
    respond(0, [FIRST, SECOND]);
    expect(page.querySelector('.kanban-heading__count')).toBeNull();
    expect(page.querySelector('app-result-count')).toBeNull();
    expect(page.querySelector('.kanban-summary')).toBeNull();
  });

  it('shows only a busy container while the first read is pending', () => {
    expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(summary()).toBeNull();
    expect(page.querySelector('.board-card')).toBeNull();
    expect(text()).not.toContain('Nenhuma OS');
    expect(text()).not.toContain('Carregando');
  });

  it.each(['board', 'users'] as const)('shows a read failure of the %s source without indicators, cards or empty states', (source) => {
    fail(0, source);
    const alert = page.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toContain('Não foi possível carregar o Kanban.');
    expect(alert?.textContent).toContain('Servidor indisponível');
    expect(retryButton()).toBeDefined();
    expect(summary()).toBeNull();
    expect(page.querySelector('.board-card, .board-column')).toBeNull();
    expect(text()).not.toContain('Nenhuma OS');
    expect(page.querySelector('.status-card')).toBeNull();
  });

  it('keeps the failure with a disabled fixed retry until the retried read succeeds', () => {
    fail(0);
    retryButton()!.click();
    render();
    expect(boards).toHaveLength(2);
    expect(retryButton()?.disabled).toBe(true);
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar o Kanban.');
    expect(page.querySelector('.board-card')).toBeNull();
    respond(1, [FIRST]);
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.querySelectorAll('.board-card')).toHaveLength(1);
  });

  it('does not show old cards or zeros after a later read fails', () => {
    respond(0, [FIRST, SECOND]);
    expect(page.querySelectorAll('.board-card')).toHaveLength(2);
    // A later read of the board, such as the reload after a status change.
    (fixture.componentInstance as unknown as { retryLoad(): void }).retryLoad();
    render();
    fail(1);
    expect(page.querySelector('.board-card')).toBeNull();
    expect(summary()).toBeNull();
  });

  it('distinguishes an empty registry from a filter without results', () => {
    respond(0, []);
    expect(text()).toContain('Nenhuma OS cadastrada');
    expect(text()).not.toContain('Nenhuma OS encontrada');
    expect(firstIndicator()).toBe('0 OS');
  });

  it('offers Limpar filtros when a filter hides every OS', () => {
    respond(0, [FIRST, SECOND]);
    filters().patchValue({ query: 'inexistente' });
    render();
    const empty = [...page.querySelectorAll<HTMLElement>('.kanban-empty')].find((item) => item.textContent?.includes('Nenhuma OS encontrada'));
    expect(empty).toBeDefined();
    expect(text()).not.toContain('Nenhuma OS cadastrada');
    const clear = [...empty!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'Limpar filtros');
    expect(clear).toBeDefined();
    clear!.click();
    render();
    expect(filters().getRawValue().query).toBe('');
    expect(page.querySelectorAll('.board-card')).toHaveLength(2);
  });

  it('discards an older read that answers after a newer one', () => {
    (fixture.componentInstance as unknown as { retryLoad(): void }).retryLoad();
    render();
    respond(1, [FIRST]);
    expect(boards[0].observed).toBe(false);
    expect(page.querySelectorAll('.board-card')).toHaveLength(1);
  });

  it('cancels the pending read on destroy', () => {
    expect(boards[0].observed).toBe(true);
    fixture.destroy();
    expect(boards[0].observed).toBe(false);
  });

  it('puts the total first: "1 OS" without filter and "X de Y" with filter, with the real singular', () => {
    respond(0, [FIRST]);
    expect(firstIndicator()).toBe('1 OS');
    filters().patchValue({ priority: 'HIGH' });
    render();
    expect(firstIndicator()).toBe('1 de 1 OS');
    filters().patchValue({ priority: 'all' });
    render();
    (fixture.componentInstance as unknown as { retryLoad(): void }).retryLoad();
    render();
    respond(1, [FIRST, SECOND]);
    expect(firstIndicator()).toBe('2 OS');
    filters().patchValue({ priority: 'HIGH' });
    render();
    expect(firstIndicator()).toBe('1 de 2 OS');
    expect(summary()!.textContent).toContain('Alta prioridade');
  });
});
