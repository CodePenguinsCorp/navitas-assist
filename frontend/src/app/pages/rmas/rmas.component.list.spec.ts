import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PageResponse, RmaResponse, RmaSummaryResponse, UserRole, UserSession, WarrantyStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { RmaFilters, RmaService } from '../../core/services/rma.service';
import { buildRma, buildRmaItem, buildRmaPage } from '../../testing/rma-fixtures';
import { RmasComponent } from './rmas.component';

type ListFn = (filters: RmaFilters) => Observable<PageResponse<RmaResponse>>;
type SummaryFn = (filters: Pick<RmaFilters, 'query' | 'status'>) => Observable<RmaSummaryResponse>;
type HistoryFn = (filters: { batchNumber?: string; serialNumber?: string }) => Observable<RmaResponse[]>;

interface SetupOptions {
  role?: UserRole;
  list?: ListFn;
  summary?: SummaryFn;
  history?: HistoryFn;
  requestedRma?: number;
}

interface ListHarness {
  filtersForm: FormGroup;
  diagnosisForm: FormGroup;
  submitFilters(): void;
  clearFilters(): void;
  goToPage(page: number): void;
  changePageSize(size: number): void;
  openDetailsModal(rma: RmaResponse): void;
  openDiagnosisModal(): void;
  saveDiagnosis(): void;
  page(): number;
}

const defaultRma = buildRma();
const defaultList: ListFn = (filters) => of(buildRmaPage([defaultRma], filters.page ?? 0, filters.size ?? 20, 45));
const defaultSummary: SummaryFn = () => of({ total: 45, ongoing: 30, highPriority: 7 });

async function setup(options: SetupOptions = {}) {
  const role = options.role ?? 'ADMIN';
  const rmaService = {
    list: vi.fn(options.list ?? defaultList),
    getSummary: vi.fn(options.summary ?? defaultSummary),
    history: vi.fn(options.history ?? (() => of([]))),
    getById: vi.fn((id: number) => of(buildRma({ id }))),
    create: vi.fn(),
    upsertDiagnosis: vi.fn((id: number) => of(buildRma({ id })))
  };
  const currentUser = signal<UserSession | null>({ username: 'tester', name: 'Tester', role });
  const providers: unknown[] = [
    provideRouter([]),
    {
      provide: AuthService,
      useValue: { currentUser: currentUser.asReadonly(), hasAnyRole: (roles: UserRole[]) => roles.includes(role) }
    },
    { provide: CatalogService, useValue: { listClientOptions: () => of([]), listProductOptions: () => of([]) } },
    { provide: RmaService, useValue: rmaService },
    { provide: ProtocolService, useValue: { listExecutions: () => of([]), listTemplates: () => of([]) } }
  ];
  if (options.requestedRma !== undefined) {
    providers.push({
      provide: ActivatedRoute,
      useValue: { snapshot: { queryParamMap: convertToParamMap({ rma: String(options.requestedRma) }) } }
    });
  }
  await TestBed.configureTestingModule({ imports: [RmasComponent], providers: providers as never[] }).compileComponents();
  const fixture: ComponentFixture<RmasComponent> = TestBed.createComponent(RmasComponent);
  fixture.detectChanges();
  const component = fixture.componentInstance as unknown as ListHarness;
  const page = fixture.nativeElement as HTMLElement;
  const render = () => fixture.detectChanges();
  return { fixture, component, page, rmaService, render };
}

function confirmFilters(component: ListHarness, query: string, status = ''): void {
  component.filtersForm.setValue({ query, status });
  component.submitFilters();
}

function countLabel(page: HTMLElement): string | null {
  return page.querySelector('.result-count')?.textContent?.trim() ?? null;
}

function summaryText(page: HTMLElement): string | null {
  return page.querySelector('.rma-summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
}

const httpError = new HttpErrorResponse({ status: 500, error: { message: 'Falha no servidor' } });

describe('RmasComponent list state', () => {
  describe('header and indicators', () => {
    it('shows the count at the foot of the list and no statistics cards', async () => {
      // A contagem fica no rodapé da lista, não no cabeçalho.
      const { page } = await setup();
      expect(countLabel(page)).toBe('45 RMAs');
      expect(page.querySelectorAll('.stat-card').length).toBe(0);
    });

    it('uses the singular for one RMA', async () => {
      // Hoje o cabeçalho não mostra "1 RMA".
      const { page } = await setup({ list: (f) => of(buildRmaPage([defaultRma], f.page ?? 0, f.size ?? 20, 1)) });
      expect(countLabel(page)).toBe('1 RMA');
    });

    it('shows indicators scoped to the whole result', async () => {
      // Hoje não há .rma-summary e o texto da página contém "nesta página".
      const { page } = await setup();
      const text = summaryText(page);
      expect(text).toContain('No resultado');
      expect(text).toContain('30');
      expect(text).toContain('7');
      expect(page.textContent).not.toContain('nesta página');
    });

    it('shows no count and no indicator values before the first responses', async () => {
      // Hoje os cartões mostram "0" (ex.: "Prioridade alta (nesta página)0") antes das respostas.
      const list$ = new Subject<PageResponse<RmaResponse>>();
      const summary$ = new Subject<RmaSummaryResponse>();
      const { page, render } = await setup({ list: () => list$, summary: () => summary$ });

      expect(countLabel(page)).toBeNull();
      expect(page.textContent).not.toContain('0 RMAs');
      expect(page.textContent).not.toMatch(/Prioridade alta[^0-9]*0/);
      expect(summaryText(page)).toBeNull();

      list$.next(buildRmaPage([defaultRma], 0, 20, 45));
      summary$.next({ total: 45, ongoing: 30, highPriority: 7 });
      render();
      expect(countLabel(page)).toBe('45 RMAs');
      expect(summaryText(page)).toContain('30');
      expect(summaryText(page)).toContain('7');
    });

    it('hides stale indicators when a later summary fails', async () => {
      // Hoje o último resumo (30/7) continua na tela depois da falha do resumo do novo filtro.
      let summaryCalls = 0;
      const { component, page, render } = await setup({
        summary: () => (summaryCalls++ === 0 ? of({ total: 45, ongoing: 30, highPriority: 7 }) : throwError(() => httpError))
      });
      expect(page.textContent).toContain('30');

      confirmFilters(component, 'outro');
      render();
      expect(page.textContent).not.toContain('30');
      expect(page.textContent).not.toContain('7');
      expect(summaryText(page)).toBeNull();
      const alerts = [...page.querySelectorAll('[role="alert"]')].map((el) => el.textContent ?? '');
      expect(alerts.some((text) => text.includes('resumo') || text.includes('Falha no servidor'))).toBe(false);
      expect(countLabel(page)).toBe('45 RMAs');
    });

    it('never shows the summary of filter A next to the list of filter B', async () => {
      // Hoje os valores de A (30/7) ficam ao lado da lista B até o resumo B responder.
      const listB$ = new Subject<PageResponse<RmaResponse>>();
      const summaryB$ = new Subject<RmaSummaryResponse>();
      let listCalls = 0;
      let summaryCalls = 0;
      const { component, page, render } = await setup({
        list: (f) => (listCalls++ === 0 ? defaultList(f) : listB$),
        summary: (f) => (summaryCalls++ === 0 ? defaultSummary(f) : summaryB$)
      });
      expect(page.textContent).toContain('30');

      confirmFilters(component, 'B');
      listB$.next(buildRmaPage([defaultRma], 0, 20, 2));
      render();
      expect(page.textContent).not.toContain('30');
      expect(page.textContent).not.toContain('7');
      expect(summaryText(page)).toBeNull();
      expect(countLabel(page)).toBe('2 RMAs');

      summaryB$.next({ total: 2, ongoing: 4, highPriority: 1 });
      render();
      expect(summaryText(page)).toContain('4 em atendimento');
      expect(summaryText(page)).toContain('1 com prioridade alta');
    });

    it('discards a late summary of filter A after B was requested', async () => {
      // Hoje a resposta atrasada de A sobrescreve B e a assinatura de A continua aberta.
      const summaryA$ = new Subject<RmaSummaryResponse>();
      const summaryB$ = new Subject<RmaSummaryResponse>();
      const subjects = [summaryA$, summaryB$];
      let summaryCalls = 0;
      const { component, page, render } = await setup({ summary: () => subjects[summaryCalls++] });

      confirmFilters(component, 'B');
      summaryB$.next({ total: 45, ongoing: 4, highPriority: 1 });
      summaryA$.next({ total: 45, ongoing: 30, highPriority: 7 });
      render();

      expect(page.textContent).not.toContain('30');
      expect(summaryA$.observed).toBe(false);
      expect(summaryText(page)).toContain('4 em atendimento');
      expect(summaryText(page)).toContain('1 com prioridade alta');
    });

    it('ignores a late error of filter A after B succeeded', async () => {
      // Hoje o erro tardio de A grava "Não foi possível carregar o resumo dos RMAs." na página.
      const summaryA$ = new Subject<RmaSummaryResponse>();
      const summaryB$ = new Subject<RmaSummaryResponse>();
      const subjects = [summaryA$, summaryB$];
      let summaryCalls = 0;
      const { component, page, render } = await setup({ summary: () => subjects[summaryCalls++] });

      confirmFilters(component, 'B');
      summaryB$.next({ total: 45, ongoing: 4, highPriority: 1 });
      summaryA$.error(httpError);
      render();

      expect(page.textContent).not.toContain('Falha no servidor');
      expect(page.textContent).not.toContain('Não foi possível carregar o resumo');
      expect(summaryText(page)).toContain('4 em atendimento');
    });

    it('waits for the list when the summary of a new filter responds first', async () => {
      const listB$ = new Subject<PageResponse<RmaResponse>>();
      const summaryB$ = new Subject<RmaSummaryResponse>();
      let listCalls = 0;
      let summaryCalls = 0;
      const { component, page, render } = await setup({
        list: (f) => (listCalls++ === 0 ? defaultList(f) : listB$),
        summary: (f) => (summaryCalls++ === 0 ? defaultSummary(f) : summaryB$)
      });

      confirmFilters(component, 'B');
      summaryB$.next({ total: 2, ongoing: 4, highPriority: 1 });
      render();
      expect(countLabel(page)).toBeNull();
      expect(summaryText(page)).toBeNull();

      listB$.next(buildRmaPage([defaultRma], 0, 20, 2));
      render();
      expect(countLabel(page)).toBe('2 RMAs');
      expect(summaryText(page)).toContain('4 em atendimento');
    });

    it('does not reuse the previous result when the same filter is searched again', async () => {
      // Hoje a contagem antiga "45 RMAs" fica visível e, depois, o novo resumo aparece ao lado da lista antiga.
      const list$ = new Subject<PageResponse<RmaResponse>>();
      const summary$ = new Subject<RmaSummaryResponse>();
      let listCalls = 0;
      let summaryCalls = 0;
      const { component, page, render } = await setup({
        list: (f) => (listCalls++ === 0 ? defaultList(f) : list$),
        summary: (f) => (summaryCalls++ === 0 ? defaultSummary(f) : summary$)
      });
      expect(countLabel(page)).toBe('45 RMAs');

      confirmFilters(component, '');
      render();
      expect(countLabel(page)).toBeNull();
      expect(summaryText(page)).toBeNull();

      summary$.next({ total: 2, ongoing: 4, highPriority: 1 });
      render();
      expect(countLabel(page)).toBeNull();
      expect(summaryText(page)).toBeNull();

      list$.next(buildRmaPage([defaultRma], 0, 20, 2));
      render();
      expect(countLabel(page)).toBe('2 RMAs');
      expect(summaryText(page)).toContain('4 em atendimento');
    });

    it('does not mix generations on A, B, A with B still pending', async () => {
      // Hoje, ao voltar para A, a contagem antiga "45 RMAs" volta a ser exibida com B pendente.
      const pendingLists = [new Subject<PageResponse<RmaResponse>>(), new Subject<PageResponse<RmaResponse>>()];
      const pendingSummaries = [new Subject<RmaSummaryResponse>(), new Subject<RmaSummaryResponse>()];
      let listCalls = 0;
      let summaryCalls = 0;
      const { component, page, render } = await setup({
        list: (f) => (listCalls++ < 2 ? defaultList(f) : pendingLists[listCalls - 3]),
        summary: (f) => (summaryCalls++ < 2 ? defaultSummary(f) : pendingSummaries[summaryCalls - 3])
      });
      confirmFilters(component, 'A');
      render();
      expect(countLabel(page)).toBe('45 RMAs');
      expect(summaryText(page)).toContain('30 em atendimento');

      confirmFilters(component, 'B');
      confirmFilters(component, 'A');
      render();
      expect(countLabel(page)).toBeNull();
      expect(summaryText(page)).toBeNull();

      const [listB$, listA$] = pendingLists;
      const [summaryB$, summaryA$] = pendingSummaries;
      summaryA$.next({ total: 1, ongoing: 1, highPriority: 0 });
      listB$.next(buildRmaPage([defaultRma], 0, 20, 2));
      summaryB$.next({ total: 2, ongoing: 9, highPriority: 9 });
      render();
      expect(countLabel(page)).toBeNull();
      expect(summaryText(page)).toBeNull();

      listA$.next(buildRmaPage([defaultRma], 0, 20, 1));
      render();
      expect(countLabel(page)).toBe('1 RMA');
      expect(summaryText(page)).toContain('1 em atendimento');
      expect(summaryText(page)).toContain('0 com prioridade alta');
    });

    it('shows the summary again after a failed list followed by a successful search', async () => {
      let failing = true;
      const { component, page, render } = await setup({
        list: (f) => (failing ? throwError(() => httpError) : defaultList(f)),
        summary: (f) => of(f.query === 'B' ? { total: 45, ongoing: 4, highPriority: 1 } : { total: 45, ongoing: 30, highPriority: 7 })
      });
      expect(page.querySelector('.table-card [role="alert"]')).not.toBeNull();
      expect(summaryText(page)).toBeNull();
      expect(countLabel(page)).toBeNull();

      failing = false;
      confirmFilters(component, 'B');
      render();
      expect(page.querySelector('.table-card [role="alert"]')).toBeNull();
      expect(countLabel(page)).toBe('45 RMAs');
      expect(summaryText(page)).toContain('4 em atendimento');
      expect(summaryText(page)).toContain('1 com prioridade alta');
    });

    it('hides the count after Buscar until the new list responds', async () => {
      // A contagem some durante a nova busca e volta com o novo resultado.
      const listB$ = new Subject<PageResponse<RmaResponse>>();
      let listCalls = 0;
      const { component, page, render } = await setup({ list: (f) => (listCalls++ === 0 ? defaultList(f) : listB$) });
      expect(countLabel(page)).toBe('45 RMAs');

      confirmFilters(component, 'B');
      render();
      expect(countLabel(page)).toBeNull();
      expect(page.querySelector('.page-heading')?.textContent).not.toContain('45');

      listB$.next(buildRmaPage([defaultRma], 0, 20, 2));
      render();
      expect(countLabel(page)).toBe('2 RMAs');
    });
  });

  describe('confirmed filter', () => {
    it('keeps the confirmed text filter when paging and changing size', async () => {
      // Hoje a busca digitada sem envio ("abc") vai na paginação.
      const { component, rmaService } = await setup();
      component.filtersForm.setValue({ query: 'abc', status: '' });

      component.goToPage(1);
      expect(rmaService.list).toHaveBeenLastCalledWith({ page: 1, size: 20, query: undefined, status: undefined });
      component.changePageSize(50);
      expect(rmaService.list).toHaveBeenLastCalledWith({ page: 0, size: 50, query: undefined, status: undefined });
    });

    it('keeps the confirmed status when paging', async () => {
      // Hoje o status trocado sem envio ("TRIAGE") vai na paginação.
      const { component, rmaService } = await setup();
      component.filtersForm.setValue({ query: '', status: 'TRIAGE' });

      component.goToPage(1);
      expect(rmaService.list).toHaveBeenLastCalledWith({ page: 1, size: 20, query: undefined, status: undefined });
    });

    it('refreshes with the confirmed filter after saving a diagnosis', async () => {
      // Hoje a recarga após salvar usa a busca não enviada ("y").
      const { component, rmaService } = await setup();
      confirmFilters(component, 'x');
      component.filtersForm.setValue({ query: 'y', status: '' });

      component.openDetailsModal(defaultRma);
      component.openDiagnosisModal();
      component.diagnosisForm.patchValue({ foundFailure: 'Falha encontrada', technicianName: 'Tecnico' });
      rmaService.list.mockClear();
      rmaService.getSummary.mockClear();
      component.saveDiagnosis();

      expect(rmaService.upsertDiagnosis).toHaveBeenCalledOnce();
      expect(rmaService.list).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'x' }));
      expect(rmaService.getSummary).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'x' }));
    });

    it('sends query and status on Buscar and resets to page 0', async () => {
      const { component, rmaService } = await setup();
      component.goToPage(1);
      confirmFilters(component, '  abc  ', 'TRIAGE');

      expect(rmaService.list).toHaveBeenLastCalledWith({ page: 0, size: 20, query: 'abc', status: 'TRIAGE' });
      expect(rmaService.getSummary).toHaveBeenLastCalledWith({ query: 'abc', status: 'TRIAGE' });
    });

    it('clears to one list request on page 0 and one summary request', async () => {
      const { component, rmaService } = await setup();
      confirmFilters(component, 'abc', 'TRIAGE');
      component.goToPage(1);
      rmaService.list.mockClear();
      rmaService.getSummary.mockClear();

      component.clearFilters();

      expect(rmaService.list).toHaveBeenCalledTimes(1);
      expect(rmaService.list).toHaveBeenCalledWith({ page: 0, size: 20, query: undefined, status: undefined });
      expect(rmaService.getSummary).toHaveBeenCalledTimes(1);
      expect(rmaService.getSummary).toHaveBeenCalledWith({ query: undefined, status: undefined });
    });

    it('falls back to the last page when the current one empties', async () => {
      const { component, rmaService } = await setup({
        list: (f) => (f.page === 2
          ? of({ content: [], page: 2, size: 20, totalElements: 21, totalPages: 2 })
          : of(buildRmaPage([defaultRma], f.page ?? 0, 20, 21)))
      });
      component.goToPage(2);

      expect(rmaService.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
      expect(component.page()).toBe(1);
    });

    it('opens the RMA requested by a notification link on the Produtos tab', async () => {
      const { page, rmaService } = await setup({ requestedRma: 1 });

      expect(rmaService.getById).toHaveBeenCalledWith(1);
      expect(page.querySelector('.rma-details')).not.toBeNull();
      const selected = page.querySelector('[role="tab"][aria-selected="true"]');
      expect(selected?.textContent?.trim()).toBe('Produtos');
    });
  });
});

function buttonByText(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === text);
}

function emptyPage(f: RmaFilters): Observable<PageResponse<RmaResponse>> {
  return of(buildRmaPage([], f.page ?? 0, f.size ?? 20, 0));
}

describe('RmasComponent list composition', () => {
  it('uses the shared toolbar with Limpar before Buscar', async () => {
    // Hoje não existe .catalog-toolbar--filters ("Buscar" vem antes de "Limpar" e há "registro(s)" no painel).
    const { page } = await setup();
    const toolbar = page.querySelector<HTMLElement>('.catalog-toolbar--filters');
    expect(toolbar).not.toBeNull();
    expect(toolbar!.querySelector('.search-field input[type="search"][formControlName="query"]')).not.toBeNull();
    expect(toolbar!.querySelector('.filter-field app-custom-select[formControlName="status"]')).not.toBeNull();
    const labels = [...toolbar!.querySelectorAll('button')].map((button) => button.textContent?.trim());
    expect(labels.indexOf('Limpar')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('Limpar')).toBeLessThan(labels.indexOf('Buscar'));
    expect(toolbar!.textContent).not.toContain('registro(s)');
  });

  it('shows the failure state on an initial load error', async () => {
    // Hoje, com a lista em erro, o corpo mostra "Nenhum RMA encontrado." e não há alerta.
    const { page } = await setup({ list: () => throwError(() => httpError) });
    expect(page.textContent).not.toContain('Nenhum RMA encontrado');
    const alert = page.querySelector('.table-card [role="alert"]');
    expect(alert?.textContent).toContain('Não foi possível carregar os RMAs.');
    expect(alert?.textContent).toContain('Falha no servidor');
    expect(buttonByText(alert!, 'Tentar novamente')).toBeDefined();
    expect(page.querySelector('app-pagination')).toBeNull();
    expect(page.textContent).not.toContain('Nenhum RMA registrado');
  });

  it('replaces the table when a reload fails after a success with records', async () => {
    // Hoje a tabela anterior continua visível depois da falha.
    let failing = false;
    const { component, page, render } = await setup({ list: (f) => (failing ? throwError(() => httpError) : defaultList(f)) });
    expect(page.querySelector('tbody')).not.toBeNull();

    failing = true;
    component.goToPage(1);
    render();
    expect(page.querySelector('tbody')).toBeNull();
    expect(page.querySelector('.table-card [role="alert"]')?.textContent).toContain('Não foi possível carregar os RMAs.');
    expect(page.querySelector('app-pagination')).toBeNull();
  });

  it('replaces the table when a reload fails after an empty success', async () => {
    // Hoje o estado vazio anterior ("Nenhum RMA encontrado.") continua depois da falha.
    let failing = false;
    const { component, page, render } = await setup({ list: (f) => (failing ? throwError(() => httpError) : emptyPage(f)) });

    failing = true;
    component.goToPage(1);
    render();
    expect(page.textContent).not.toContain('Nenhum RMA');
    expect(page.querySelector('.table-card [role="alert"]')?.textContent).toContain('Não foi possível carregar os RMAs.');
  });

  it('recovers with Tentar novamente using the confirmed filter and page', async () => {
    // Hoje não existe o botão "Tentar novamente".
    let failing = false;
    const { component, page, render, rmaService } = await setup({ list: (f) => (failing ? throwError(() => httpError) : defaultList(f)) });
    confirmFilters(component, 'abc');
    failing = true;
    component.goToPage(1);
    render();
    component.filtersForm.setValue({ query: 'nao enviado', status: 'TRIAGE' });
    failing = false;
    rmaService.getSummary.mockClear();

    const retry = buttonByText(page, 'Tentar novamente');
    expect(retry).toBeDefined();
    retry!.click();
    render();

    expect(rmaService.list).toHaveBeenLastCalledWith({ page: 1, size: 20, query: 'abc', status: undefined });
    expect(rmaService.getSummary).toHaveBeenCalledOnce();
    expect(rmaService.getSummary).toHaveBeenCalledWith({ query: 'abc', status: undefined });
    expect(page.querySelector('tbody')).not.toBeNull();
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  it('distinguishes an empty registry from a search without results', async () => {
    // Hoje os dois casos mostram "Nenhum RMA encontrado." sem "Limpar busca e filtros".
    const { component, page, render, rmaService } = await setup({ list: emptyPage });
    expect(page.textContent).toContain('Nenhum RMA registrado');
    expect(page.textContent).toContain('Abra o primeiro RMA para iniciar o atendimento.');
    expect(page.textContent).not.toContain('Nenhum RMA encontrado');

    confirmFilters(component, 'zzz');
    render();
    expect(page.textContent).toContain('Nenhum RMA encontrado');
    expect(page.textContent).toContain('Ajuste a busca ou o status.');
    expect(page.textContent).not.toContain('Nenhum RMA registrado');
    rmaService.list.mockClear();
    rmaService.getSummary.mockClear();

    buttonByText(page.querySelector('.table-card')!, 'Limpar busca e filtros')!.click();
    render();
    expect(rmaService.list).toHaveBeenCalledOnce();
    expect(rmaService.list).toHaveBeenCalledWith({ page: 0, size: 20, query: undefined, status: undefined });
    expect(rmaService.getSummary).toHaveBeenCalledOnce();
    expect(page.textContent).toContain('Nenhum RMA registrado');
  });

  it('keeps the table while reloading a page', async () => {
    // Hoje, com a página atual vazia, recarregar troca o estado por "Carregando RMAs...".
    const pending$ = new Subject<PageResponse<RmaResponse>>();
    let pendingMode = false;
    let empty = false;
    const { component, page, render } = await setup({
      list: (f) => (pendingMode ? pending$ : empty ? emptyPage(f) : defaultList(f))
    });

    pendingMode = true;
    component.goToPage(1);
    render();
    expect(page.querySelector('tbody')).not.toBeNull();
    expect(page.textContent).not.toContain('Carregando RMAs...');

    pendingMode = false;
    empty = true;
    confirmFilters(component, 'zzz');
    render();
    pendingMode = true;
    component.goToPage(0);
    render();
    expect(page.textContent).not.toContain('Carregando RMAs...');
    expect(page.textContent).toContain('Nenhum RMA encontrado');
  });

  it('keeps RMA codes on one line and counts products with singular and plural', async () => {
    // Hoje o subtítulo do produto diz "1 item(ns)" e "2 item(ns)".
    const single = buildRma({ id: 1, code: 'RMA-2026-000001' });
    const double = buildRma({
      id: 2, code: 'RMA-2026-000002',
      items: [buildRmaItem({ id: 3 }), buildRmaItem({ id: 4, productSku: 'SKU-4', productName: 'Outro' })]
    });
    const { page } = await setup({ list: (f) => of(buildRmaPage([single, double], f.page ?? 0, f.size ?? 20, 2)) });
    const rows = [...page.querySelectorAll('tbody tr')];
    const productSubtitle = (row: Element) => row.querySelectorAll('td')[2].querySelector('.table-subtitle')?.textContent?.trim();

    expect(productSubtitle(rows[0])).toBe('1 item');
    expect(productSubtitle(rows[1])).toBe('2 itens');
    const code = page.querySelector<HTMLElement>('.rma-table-code')!;
    expect(getComputedStyle(code).whiteSpace).toBe('nowrap');
  });

  it('opens the detail by click, Enter and Space on a row', async () => {
    const { page, render } = await setup();
    const open = (trigger: (row: HTMLElement) => void) => {
      trigger(page.querySelector<HTMLElement>('.rma-table-row')!);
      render();
      const opened = page.querySelector('.rma-details') !== null;
      page.querySelector<HTMLButtonElement>('.rma-details .modal-close')?.click();
      render();
      return opened;
    };

    expect(open((row) => row.click())).toBe(true);
    expect(open((row) => row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))).toBe(true);
    expect(open((row) => row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))).toBe(true);
  });

  it('changes page and page size through the pagination', async () => {
    const { component, page, render, rmaService } = await setup();
    confirmFilters(component, 'abc');
    render();

    buttonByText(page.querySelector('app-pagination')!, 'Próxima')!.click();
    render();
    expect(rmaService.list).toHaveBeenLastCalledWith({ page: 1, size: 20, query: 'abc', status: undefined });

    const sizeSelect = page.querySelector<HTMLElement>('app-pagination app-custom-select')!;
    sizeSelect.querySelector<HTMLButtonElement>('.custom-select__trigger')!.click();
    render();
    [...sizeSelect.querySelectorAll<HTMLButtonElement>('.custom-select__option')]
      .find((option) => option.textContent?.trim() === '50')!.click();
    render();
    expect(rmaService.list).toHaveBeenLastCalledWith({ page: 0, size: 50, query: 'abc', status: undefined });
  });

  it('keeps warranty per product with an accessible status', async () => {
    const rma = buildRma({ items: [buildRmaItem({ productSku: 'SKU-9', warrantyStatus: WarrantyStatus.IN_WARRANTY })] });
    const { page } = await setup({ list: (f) => of(buildRmaPage([rma], f.page ?? 0, f.size ?? 20, 1)) });
    const tag = page.querySelector('tbody .warranty-tag')!;

    expect(tag.textContent).toContain('SKU-9');
    expect(tag.querySelector('.sr-only')?.textContent?.trim()).toBe('· Em garantia');
  });

  it.each([
    ['ADMIN', true],
    ['SERVICE_DESK', true],
    ['TECHNICIAN', false],
    ['VIEWER', false]
  ] as const)('shows Novo RMA only for ADMIN and SERVICE_DESK (%s)', async (role, allowed) => {
    const { page } = await setup({ role, list: emptyPage });

    expect(buttonByText(page.querySelector('.page-heading')!, 'Novo RMA') !== undefined).toBe(allowed);
    expect(buttonByText(page.querySelector('.table-card')!, 'Novo RMA') !== undefined).toBe(allowed);
  });
});
