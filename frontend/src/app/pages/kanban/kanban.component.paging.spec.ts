import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { RMA_STATUS_FLOW } from '../../core/mock-data';
import { RmaBoardCardResponse, RmaBoardPageResponse, RmaStatus } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { KanbanViewService } from '../../core/services/kanban-view.service';
import { ToastService } from '../../core/services/toast.service';
import { RmaService } from '../../core/services/rma.service';
import { buildRma } from '../../testing/rma-fixtures';
import { providePermissions, profilePermissions } from '../../testing/permission-fixtures';
import { toBoardCard } from '../../core/utils/rma-ui';
import { KanbanComponent } from './kanban.component';

describe('Kanban paginado no servidor', () => {
  let fixture: ComponentFixture<KanbanComponent>;
  let component: any;
  let requests: { filters: any; page: number; source: Subject<RmaBoardPageResponse> }[];
  let api: any;
  const first = toBoardCard(buildRma({ id: 1, status: 'RECEIVED', priority: 'LOW' }));
  const second = toBoardCard(buildRma({ id: 2, status: 'RECEIVED', priority: 'HIGH' }));
  const counts = { statusCounts: { RECEIVED: 45 }, total: 45, highPriority: 30, active: 45, closed: 0, waitingPart: 0 };

  beforeEach(async () => {
    requests = [];
    api = {
      listBoardColumn: vi.fn((filters: any, page = 0) => {
        const source = new Subject<RmaBoardPageResponse>();
        requests.push({ filters, page, source });
        return source;
      }),
      getBoardCounts: vi.fn(() => of(counts)),
      updateBoardPosition: vi.fn(() => of(first)),
    };
    await TestBed.configureTestingModule({ imports: [KanbanComponent], providers: [
      provideRouter([]), providePermissions(profilePermissions('ADMIN')),
      { provide: RmaService, useValue: api },
      { provide: CatalogService, useValue: { listAssignableUsers: () => of([]) } },
      { provide: KanbanViewService, useValue: { list: () => of([]) } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(KanbanComponent);
    component = fixture.componentInstance;
  });
  afterEach(() => { fixture.destroy(); vi.useRealTimers(); });

  function respond(cards: RmaBoardCardResponse[] = [first, second]): void {
    for (const request of requests.filter(r => r.page === 0 && !r.source.closed)) {
      const matching = cards.filter(c => c.status === request.filters.status);
      request.source.next({ cards: matching, total: matching.length ? 45 : 0, hasMore: matching.length > 0, page: 0, size: 20 });
      request.source.complete();
    }
    fixture.detectChanges();
  }

  it('abre as colunas em paralelo e preserva a ordem recebida e os totais reais', () => {
    expect(requests.map(r => r.filters.status)).toEqual(RMA_STATUS_FLOW);
    respond();
    const host = fixture.nativeElement as HTMLElement;
    expect([...host.querySelectorAll('.board-card')].map(c => c.getAttribute('data-rma-id'))).toEqual(['1', '2']);
    expect(host.querySelector('[data-status="RECEIVED"] .status-pill')?.textContent).toContain('45');
    expect(component.highPriorityCount()).toBe(30);
    expect(component.totalSummary().count).toBe(45);
  });

  it('cancela imediatamente a geração anterior e busca texto após 300 ms', () => {
    vi.useFakeTimers();
    const old = requests[0].source;
    component.filtersForm.patchValue({ query: 'Série' });
    expect(old.observed).toBe(false);
    vi.advanceTimersByTime(299);
    expect(requests.length).toBe(RMA_STATUS_FLOW.length);
    vi.advanceTimersByTime(1);
    expect(requests.at(-1)?.filters.query).toBe('Série');
    old.next({ cards: [first], total: 1, hasMore: false, page: 0, size: 20 });
    expect(component.filteredRmas()).toEqual([]);
  });

  it('não duplica páginas, preserva cartões no erro e permite tentar novamente', () => {
    respond();
    component.loadMore('RECEIVED');
    component.loadMore('RECEIVED');
    expect(requests.filter(r => r.page === 1).length).toBe(1);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.board-skeleton').length).toBe(3);
    requests.at(-1)!.source.error(new Error('Falha'));
    fixture.detectChanges();
    expect(component.filteredRmas().length).toBe(2);
    const retry = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.board-more-error button')!;
    expect(retry.textContent).toContain('Tentar novamente');
    retry.click();
    const page = requests.at(-1)!;
    expect(page.page).toBe(1);
    page.source.next({ cards: [second, { ...first, id: 3 }], total: 45, hasMore: false, page: 1, size: 20 });
    page.source.complete();
    expect(component.filteredRmas().map((c: RmaBoardCardResponse) => c.id)).toEqual([1, 2, 3]);
  });

  it('reconcilia o movimento sem esqueletos, vazio ou avisos duplicados', () => {
    respond([first]);
    const toasts = TestBed.inject(ToastService);
    const notice = vi.spyOn(toasts, 'show');
    api.updateBoardPosition.mockReturnValue(of({ ...first, status: 'TRIAGE' }));
    component.reorderCard(first, 'TRIAGE', null);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const source = host.querySelector('[data-status="RECEIVED"]')!;
    expect(host.querySelectorAll('.board-skeleton').length).toBe(0);
    expect(source.textContent).not.toContain('Nenhum item');
    expect(host.querySelector('[data-status="TRIAGE"] [data-rma-id="1"]')).not.toBeNull();
    expect(host.querySelector('.board-column__stack')?.classList.contains('app-scroll')).toBe(true);
    expect(notice).toHaveBeenCalledTimes(1);
    respond([{ ...first, status: 'TRIAGE' }]);
    expect(source.textContent).toContain('Nenhum item');
    expect(notice).toHaveBeenCalledTimes(1);
    expect(notice.mock.calls[0][0].message).toBe('Movido para Triagem');
    expect(toasts.toasts().length).toBe(1);
  });

  it('reverte a ordem otimista e anuncia falha ao gravar', () => {
    respond();
    const pending = new Subject<RmaBoardCardResponse>();
    api.updateBoardPosition.mockReturnValue(pending);
    component.reorderCard(first, 'RECEIVED', null);
    expect(component.filteredRmas().map((c: RmaBoardCardResponse) => c.id)).toEqual([2, 1]);
    expect(api.updateBoardPosition).toHaveBeenCalledWith(1, { status: 'RECEIVED', afterId: 2, beforeId: null });
    pending.error({ error: { message: 'Não foi possível mover.' } });
    expect(component.filteredRmas().map((c: RmaBoardCardResponse) => c.id)).toEqual([1, 2]);
    expect(component.pageError()).toContain('Não foi possível mover.');
  });

  it('soltar o cartão exatamente onde ele já estava não é alteração', () => {
    respond();
    component.reorderCard(first, 'RECEIVED', 2);
    component.reorderCard(second, 'RECEIVED', null);
    expect(api.updateBoardPosition).not.toHaveBeenCalled();
    expect(component.filteredRmas().map((c: RmaBoardCardResponse) => c.id)).toEqual([1, 2]);
  });

  it('cancela páginas de outras colunas antes do snapshot para não prendê-las na reversão', () => {
    respond([first, second, { ...first, id: 9, status: 'TRIAGE' }]);
    component.loadMore('TRIAGE');
    const otherPage = requests.at(-1)!.source;
    const pending = new Subject<RmaBoardCardResponse>();
    api.updateBoardPosition.mockReturnValue(pending);
    component.reorderCard(first, 'RECEIVED', null);
    expect(otherPage.observed).toBe(false);
    pending.error(new Error('Falha'));
    expect(component.columnStates().TRIAGE.loadingMore).toBe(false);
  });

  it('ao atingir o limite carregado pelo teclado carrega a próxima página sem mover', () => {
    respond();
    component.moveByKeyboard(second, 1);
    expect(requests.at(-1)?.page).toBe(1);
    expect(api.updateBoardPosition).not.toHaveBeenCalled();
  });

  it('recarrega os filtros atuais quando uma gravação da geração anterior termina', () => {
    respond();
    const pending = new Subject<RmaBoardCardResponse>();
    api.updateBoardPosition.mockReturnValue(pending);
    component.reorderCard(first, 'RECEIVED', null);
    component.filtersForm.patchValue({ priority: 'HIGH' });
    respond();
    const before = requests.length;
    pending.next(first); pending.complete();
    expect(requests.length).toBeGreaterThan(before);
    expect(requests.at(-1)?.filters.priority).toBe('HIGH');
  });

  it('reinicia a leitura em andamento ao receber uma edição do detalhe', () => {
    respond();
    component.filtersForm.patchValue({ priority: 'HIGH' });
    const before = requests.length;
    component.applyRmaUpdate(buildRma({ id: 1, status: 'RECEIVED', priority: 'HIGH' }));
    expect(requests.length).toBeGreaterThan(before);
    expect(requests.at(-1)?.filters.priority).toBe('HIGH');
  });

  it('mostra X de Y a partir de duas agregações, independentemente dos cartões carregados', () => {
    respond();
    api.getBoardCounts.mockImplementation((filters: any) => of(filters?.priority ? { ...counts, total: 12, active: 12, highPriority: 12 } : counts));
    component.filtersForm.patchValue({ priority: 'HIGH' }); respond();
    expect(component.totalSummary()).toEqual({ count: 12, overall: 45, label: 'OS' });
    expect(component.highPriorityCount()).toBe(12);
    expect(component.filteredRmas().length).toBe(2);
  });

  it('cancela requisições incrementais ao destruir', () => {
    respond(); component.loadMore('RECEIVED');
    const pending = requests.at(-1)!.source;
    expect(pending.observed).toBe(true);
    fixture.destroy();
    expect(pending.observed).toBe(false);
  });

  it('relê todas as páginas visíveis após ordenar e preserva o foco pelo id', () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({ ...first, id: i + 1 }));
    respond(cards);
    component.loadMore('RECEIVED');
    let request = requests.at(-1)!;
    request.source.next({ cards: [{ ...first, id: 21 }], total: 45, hasMore: true, page: 1, size: 20 }); request.source.complete();
    api.updateBoardPosition.mockReturnValue(of(second));
    component.moveByKeyboard(second, -1);
    expect(component.filteredRmas().length).toBe(21);
    const reconciliation = requests.slice(-2);
    expect(reconciliation.map(r => r.page)).toEqual([0, 1]);
    expect(component.columnStates().RECEIVED.nextPage).toBe(0);
    reconciliation[0].source.next({ cards: [second, first, ...cards.slice(2)], total: 45, hasMore: true, page: 0, size: 20 }); reconciliation[0].source.complete();
    reconciliation[1].source.next({ cards: [{ ...first, id: 21 }], total: 45, hasMore: true, page: 1, size: 20 }); reconciliation[1].source.complete();
    fixture.detectChanges();
    expect(component.columnStates().RECEIVED.nextPage).toBe(2);
    expect(component.filteredRmas().length).toBe(21);
    expect(document.activeElement?.getAttribute('data-rma-id')).toBe('2');
  });

  it('permite mover para coluna excluída pelo filtro e reconcilia a coluna visível', () => {
    respond();
    component.filtersForm.patchValue({ status: 'RECEIVED' }); respond();
    api.updateBoardPosition.mockReturnValue(of({ ...first, status: 'TRIAGE' }));
    component.reorderCard(first, 'TRIAGE', null);
    expect(api.updateBoardPosition).toHaveBeenCalledWith(1, { status: 'TRIAGE', afterId: null, beforeId: null });
    expect(component.columnStates().TRIAGE).toBeUndefined();
    expect(requests.at(-1)?.filters.status).toBe('RECEIVED');
  });

  it.each(['COMPLETED', 'RETURNED', 'IRREPARABLE'] as const)('pagina a coluna encerrada %s', status => {
    respond([{ ...first, status }]);
    component.loadMore(status);
    expect(requests.at(-1)?.filters.status).toBe(status);
    expect(requests.at(-1)?.page).toBe(1);
  });
});
