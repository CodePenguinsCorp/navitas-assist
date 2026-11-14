import { providePermissions } from '../../testing/permission-fixtures';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ClientRequest, ClientResponse, PageResponse } from '../../core/models';
import { CatalogService, ClientFilters } from '../../core/services/catalog.service';
import { LoadingService } from '../../core/services/loading.service';
import { PresenceFilter } from '../../core/utils/catalog-ui';
import { provideRouter } from '@angular/router';
import { App } from '../../app';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { mountUnderRoot, simulateNativeModality } from '../../testing/native-dialog';
import { ClientsComponent } from './clients.component';

beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), providePermissions(['cadastros.ver', 'cadastros.editar'])] }));

function client(id: number, legalName: string): ClientResponse {
  return {
    id, legalName, tradeName: null, documentNumber: null, email: null,
    phone: null, address: null, notes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  };
}

function page(content: ClientResponse[], pageNumber = 0, size = 20, totalElements = content.length): PageResponse<ClientResponse> {
  return { content, page: pageNumber, size, totalElements, totalPages: Math.ceil(totalElements / size) };
}

describe('ClientsComponent pagination', () => {
  let component: ClientsHarness;
  let fixture: ComponentFixture<ClientsComponent>;
  let listClients: ReturnType<typeof vi.fn>;
  let getClientSummary: ReturnType<typeof vi.fn>;
  let deleteClient: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    listClients = vi.fn((filters: ClientFilters) => of(page([client(1, 'Alfa'), client(2, 'Beta')], filters.page, filters.size, 45)));
    getClientSummary = vi.fn(() => of({ total: 45, withContact: 10, withDocument: 20, withEmail: 30 }));
    deleteClient = vi.fn(() => of(undefined));

    await TestBed.configureTestingModule({
      imports: [ClientsComponent],
      providers: [{ provide: CatalogService, useValue: {
        listClients,
        getClientSummary,
        deleteClient,
        createClient: (request: ClientRequest) => of({ ...client(9, request.legalName) }),
        updateClient: (id: number, request: ClientRequest) => of({ ...client(id, request.legalName) })
      } }]
    }).compileComponents();

    fixture = TestBed.createComponent(ClientsComponent);
    component = fixture.componentInstance as unknown as ClientsHarness;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('loads the first page with the default size and shows the total and summary', () => {
    expect(listClients).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', hasDocument: undefined, hasEmail: undefined });
    expect(fixture.nativeElement.querySelector('.pagination__summary')?.textContent?.trim()).toBe('1–2 de 45 clientes');
    expect(fixture.nativeElement.textContent).not.toContain('registro(s)');
    expect(fixture.nativeElement.textContent).toContain('Página 1 de 3');
    expect(getClientSummary).toHaveBeenCalledTimes(1);
  });

  it('navigates between pages and keeps the active filters', () => {
    component.updateDocumentFilter('with');
    component.goToPage(1);

    expect(listClients).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', hasDocument: true, hasEmail: undefined });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Página 2 de 3');
  });

  it('returns to the first page when a filter or the page size changes', () => {
    component.goToPage(2);
    component.updateEmailFilter('without');
    expect(listClients).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', hasDocument: undefined, hasEmail: false });

    component.goToPage(1);
    component.changePageSize(50);
    expect(listClients).toHaveBeenLastCalledWith({ page: 0, size: 50, query: '', hasDocument: undefined, hasEmail: false });
  });

  it('debounces the text search and queries the backend from the first page', () => {
    component.goToPage(1);
    listClients.mockClear();

    component.updateSearch('al');
    component.updateSearch('alfa');
    expect(listClients).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(listClients).toHaveBeenCalledTimes(1);
    expect(listClients).toHaveBeenLastCalledWith({ page: 0, size: 20, query: 'alfa', hasDocument: undefined, hasEmail: undefined });
  });

  it('shows the filtered empty state only when filters are active', () => {
    listClients.mockImplementation(() => of(page([])));
    component.updateDocumentFilter('without');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nenhum cliente encontrado');
    expect(fixture.nativeElement.querySelector('app-result-count, app-pagination')).toBeNull();
  });

  it('reloads the current page and the summary after deleting a client', () => {
    component.goToPage(1);
    listClients.mockClear();
    getClientSummary.mockClear();

    component.openDeleteModal(client(1, 'Alfa'));
    component.confirmDeleteClient();

    expect(deleteClient).toHaveBeenCalledWith(1);
    expect(listClients).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', hasDocument: undefined, hasEmail: undefined });
    expect(getClientSummary).toHaveBeenCalledTimes(1);
  });

  it('moves back to the last page when the current page becomes empty', () => {
    listClients.mockImplementation((filters: ClientFilters) =>
      of(filters.page === 2 ? page([], 2, 20, 40) : page([client(1, 'Alfa')], filters.page, filters.size, 40)));

    component.goToPage(2);

    expect(listClients).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', hasDocument: undefined, hasEmail: undefined });
  });

  it('shows Cancelar before the primary action in the form dialog', () => {
    component.openCreateModal();
    fixture.detectChanges();

    expectCancelBeforePrimary(fixture.nativeElement);
  });

  it('shows Cancelar before the delete action', () => {
    component.openDeleteModal(client(1, 'Alfa'));
    fixture.detectChanges();

    expectCancelBeforePrimary(fixture.nativeElement);
  });
});

describe('ClientsComponent collection layout and states', () => {
  let fixture: ComponentFixture<ClientsComponent>;
  let component: ClientsHarness;
  let element: HTMLElement;
  let listClients: ReturnType<typeof vi.fn>;
  let getClientSummary: ReturnType<typeof vi.fn>;
  let deleteClient: ReturnType<typeof vi.fn>;

  const loadError = () => throwError(() => new HttpErrorResponse({ status: 503, error: { message: 'Serviço indisponível.' } }));

  async function mount(options: {
    list?: (filters: ClientFilters) => Observable<PageResponse<ClientResponse>>;
    summary?: () => Observable<unknown>;
  } = {}): Promise<void> {
    vi.useFakeTimers();
    listClients = vi.fn(options.list ?? ((filters: ClientFilters) =>
      of(page([client(1, 'Alfa'), client(2, 'Beta')], filters.page, filters.size, 45))));
    getClientSummary = vi.fn(options.summary ?? (() => of({ total: 45, withContact: 10, withDocument: 20, withEmail: 30 })));
    deleteClient = vi.fn(() => of(undefined));

    await TestBed.configureTestingModule({
      imports: [ClientsComponent],
      providers: [{ provide: CatalogService, useValue: {
        listClients,
        getClientSummary,
        deleteClient,
        createClient: (request: ClientRequest) => of({ ...client(9, request.legalName) }),
        updateClient: (id: number, request: ClientRequest) => of({ ...client(id, request.legalName) })
      } }]
    }).compileComponents();

    fixture = TestBed.createComponent(ClientsComponent);
    component = fixture.componentInstance as unknown as ClientsHarness;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  /** The pagination is the only total of the list. */
  const count = () => element.querySelector('.pagination__summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const loadAlert = () => element.querySelector('.table-card [role="alert"]');
  const buttonByText = (text: string) => Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent?.trim() === text);

  function expectFailureState(): void {
    expect(loadAlert()?.textContent).toContain('Não foi possível carregar os clientes.');
    expect(buttonByText('Tentar novamente')).toBeDefined();
    expect(element.textContent).not.toContain('Nenhum cliente cadastrado');
    expect(element.querySelector('tbody')).toBeNull();
    expect(element.querySelector('app-pagination')).toBeNull();
    expect(count()).toBeNull();
  }

  it('shows a single total, in the pagination, and not in the search label', async () => {
    await mount();
    expect(element.querySelector('.page-heading h1')?.textContent?.trim()).toBe('Clientes');
    expect(element.querySelector('app-result-count')).toBeNull();
    expect(element.querySelectorAll('.pagination__summary').length).toBe(1);
    expect(count()).toBe('1–2 de 45 clientes');
    expect(element.querySelector('.search-field')?.textContent).not.toContain('registro(s)');
    expect(element.querySelector('.search-field')?.textContent).toContain('Buscar');
  });

  it('shows the filtered total in the pagination while a filter is active', async () => {
    await mount({ list: (filters) => of(page([client(1, 'Alfa')], filters.page, filters.size, filters.hasDocument ? 12 : 45)) });
    component.updateDocumentFilter('with');
    fixture.detectChanges();
    expect(count()).toBe('1–1 de 12 clientes');
    expect(element.querySelector('app-result-count')).toBeNull();
  });

  it('uses the singular for one client', async () => {
    await mount({ list: (filters) => of(page([client(1, 'Alfa')], filters.page, filters.size, 1)) });
    expect(count()).toBe('1–1 de 1 cliente');
  });

  it('keeps the paginated total when the summary is unavailable', async () => {
    await mount({
      list: (filters) => of(page([client(1, 'Alfa')], filters.page, filters.size, filters.hasDocument ? 12 : 45)),
      summary: loadError
    });
    component.updateDocumentFilter('with');
    fixture.detectChanges();
    expect(count()).toBe('1–1 de 12 clientes');
  });

  it('does not render statistics cards', async () => {
    await mount();
    expect(element.querySelector('.stats-grid')).toBeNull();
    expect(element.querySelector('.stat-card')).toBeNull();
    expect(getClientSummary).toHaveBeenCalledTimes(1);
  });

  it('names row actions with the client and shows tooltips', async () => {
    await mount();
    const [edit, remove] = Array.from(element.querySelectorAll<HTMLButtonElement>('tbody tr:first-child .row-actions button'));
    expect(element.querySelector('thead')?.textContent).toContain('Ações');
    expect(edit.getAttribute('aria-label')).toBe('Editar Alfa');
    expect(remove.getAttribute('aria-label')).toBe('Excluir Alfa');
    expect(edit.querySelector('[role="tooltip"]')?.textContent?.trim()).toBe('Editar');
    expect(remove.querySelector('[role="tooltip"]')?.textContent?.trim()).toBe('Excluir');
    expect(edit.hasAttribute('title')).toBe(false);
    expect(remove.hasAttribute('title')).toBe(false);

    remove.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alertdialog"]')?.textContent).toContain('Alfa');
  });

  it('shows a dash with an accessible label for missing contact and document', async () => {
    const complete: ClientResponse = {
      ...client(2, 'Beta'), tradeName: 'Beta Fantasia', phone: '(11) 9999-0000', email: 'beta@example.com', documentNumber: '12.345.678/0001-90'
    };
    await mount({ list: (filters) => of(page([client(1, 'Alfa'), complete], filters.page, filters.size, 2)) });
    const [missingRow, completeRow] = Array.from(element.querySelectorAll('tbody tr'));
    const body = element.querySelector('tbody')!.textContent ?? '';
    const srOnly = Array.from(missingRow.querySelectorAll('.sr-only')).map((node) => node.textContent?.trim());

    expect(body).not.toContain('Não informado');
    expect(body).not.toContain('Sem nome fantasia');
    expect(srOnly).toEqual(expect.arrayContaining(['Telefone não informado', 'E-mail não informado', 'CPF/CNPJ não informado']));
    expect(missingRow.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
    expect(missingRow.querySelector('td:first-child .table-subtitle')).toBeNull();
    expect(completeRow.textContent).toContain('Beta Fantasia');
    expect(completeRow.textContent).toContain('(11) 9999-0000');
    expect(completeRow.textContent).toContain('beta@example.com');
    expect(completeRow.textContent).toContain('12.345.678/0001-90');
  });

  it('groups the form into Identificação, Contato and Observações', async () => {
    await mount();
    component.openCreateModal();
    fixture.detectChanges();

    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(element.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)?.textContent?.trim()).toBe('Novo cliente');
    const sections = Array.from(dialog.querySelectorAll('fieldset.form-section'));
    expect(sections.map((section) => section.querySelector('legend')?.textContent?.trim())).toEqual(['Identificação', 'Contato', 'Observações']);
    const controlsIn = (section: Element) => Array.from(section.querySelectorAll('[formControlName]')).map((node) => node.getAttribute('formControlName'));
    expect(controlsIn(sections[0])).toEqual(['legalName', 'tradeName', 'documentNumber']);
    expect(controlsIn(sections[1])).toEqual(['phone', 'email', 'address']);
    expect(controlsIn(sections[2])).toEqual(['notes']);
    expect(dialog.querySelectorAll('[formControlName]').length).toBe(7);
    expect(dialog.textContent).not.toContain('Preencha os dados principais');
  });

  it('renders an empty busy container until the first empty response', async () => {
    const pending = new Subject<PageResponse<ClientResponse>>();
    await mount({ list: () => pending });
    expectPending(element);
    expect(element.querySelector('tbody, .table-card .empty-state')).toBeNull();
    expect(element.textContent).not.toContain('Nenhum cliente');
    pending.next(page([], 0, 20, 0)); pending.complete(); fixture.detectChanges();
    expect(element.querySelector('[aria-busy="true"]')).toBeNull();
    expect(element.textContent).toContain('Nenhum cliente');
  });

  it.each([false, true])('hides old rows and empty state during a filter load (empty=%s)', async (empty) => {
    await mount(empty ? { list: (filters) => of(page([], filters.page, filters.size, 0)) } : {});
    const pending = new Subject<PageResponse<ClientResponse>>();
    listClients.mockImplementation(() => pending);
    component.updateDocumentFilter('with'); fixture.detectChanges();
    expectPending(element);
    expect(element.querySelector('tbody, .table-card .empty-state')).toBeNull();
    expect(element.textContent).not.toContain('Nenhum cliente');
  });

  it('shows the failure state on an initial load error', async () => {
    await mount({ list: loadError });
    expectFailureState();
  });

  it('shows the failure state when a reload fails after an empty success', async () => {
    await mount({ list: (filters) => of(page([], filters.page, filters.size, 0)) });
    expect(element.textContent).toContain('Nenhum cliente cadastrado');
    listClients.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();
  });

  it('shows the failure state when a reload fails after a success with records', async () => {
    await mount();
    expect(element.querySelector('tbody')).not.toBeNull();
    listClients.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();
  });

  it('recovers with Tentar novamente using the same filters and page', async () => {
    await mount({ list: (filters) => of(page([client(1, 'Alfa')], filters.page, filters.size, filters.hasDocument ? 30 : 45)) });
    const working = listClients.getMockImplementation()!;
    component.updateDocumentFilter('with');
    listClients.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();

    listClients.mockImplementation(working);
    buttonByText('Tentar novamente')!.click();
    fixture.detectChanges();

    expect(listClients).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', hasDocument: true, hasEmail: undefined });
    expect(loadAlert()).toBeNull();
    expect(element.querySelector('tbody')?.textContent).toContain('Alfa');
    expect(count()).toBe('21–21 de 30 clientes');
  });

  it('shows a disabled loading retry without the old table or count while the retry is pending, then recovers', async () => {
    await mount();
    expect(count()).toBe('1–2 de 45 clientes');
    listClients.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();

    const pending = new Subject<PageResponse<ClientResponse>>();
    listClients.mockImplementation(() => pending);
    buttonByText('Tentar novamente')!.click();
    fixture.detectChanges();

    const retry = loadAlert()!.querySelector<HTMLButtonElement>('button')!;
    expect(retry.disabled).toBe(true);
    expect(retry.textContent?.trim()).toBe('Tentar novamente');
    expect(element.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(buttonByText('Tentar novamente')?.disabled).toBe(true);
    expect(element.querySelector('tbody')).toBeNull();
    expect(element.querySelector('app-pagination')).toBeNull();
    expect(count()).toBeNull();

    pending.next(page([client(3, 'Gama')], 1, 20, 45));
    pending.complete();
    fixture.detectChanges();

    expect(loadAlert()).toBeNull();
    expect(element.querySelector('tbody')?.textContent).toContain('Gama');
    expect(count()).toBe('21–21 de 45 clientes');
  });

  it('keeps the failure state after opening and closing the form', async () => {
    await mount({ list: loadError });
    component.openCreateModal();
    fixture.detectChanges();
    component.closeModal();
    fixture.detectChanges();
    expectFailureState();
  });

  it('clears search and every filter from a later page with exactly one request, keeping the page size', async () => {
    await mount({ list: (filters) => of(filters.hasDocument !== undefined || filters.hasEmail !== undefined || filters.query
      ? page([], filters.page, filters.size, 0)
      : page([client(1, 'Alfa')], filters.page, filters.size, 45)) });
    component.changePageSize(50);
    component.updateSearch('alfa');
    vi.advanceTimersByTime(300);
    component.updateDocumentFilter('with');
    component.updateEmailFilter('without');
    component.goToPage(2);
    expect(listClients).toHaveBeenLastCalledWith({ page: 2, size: 50, query: 'alfa', hasDocument: true, hasEmail: false });
    component.updateSearch('alfa ltda');
    fixture.detectChanges();
    expect(element.textContent).toContain('Nenhum cliente encontrado');
    listClients.mockClear();

    buttonByText('Limpar busca e filtros')!.click();
    vi.advanceTimersByTime(400);
    fixture.detectChanges();

    expect(listClients).toHaveBeenCalledTimes(1);
    expect(listClients).toHaveBeenCalledWith({ page: 0, size: 50, query: '', hasDocument: undefined, hasEmail: undefined });
    expect(element.querySelector<HTMLInputElement>('.search-field input')!.value).toBe('');
    expect(element.querySelector('tbody')?.textContent).toContain('Alfa');
    expect(count()).toBe('1–1 de 45 clientes');
  });

  it('identifies the client in the delete confirmation', async () => {
    await mount();
    component.openDeleteModal({ ...client(1, 'Alfa Ltda'), documentNumber: '12.345.678/0001-90' });
    fixture.detectChanges();
    const dialog = element.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('Alfa Ltda');
    expect(dialog.textContent).toContain('12.345.678/0001-90');
  });

  it('keeps the delete dialog open with the link error', async () => {
    await mount();
    deleteClient.mockImplementation(() => throwError(() =>
      new HttpErrorResponse({ status: 409, error: { message: 'Cliente possui ordens de serviço vinculadas.' } })));
    listClients.mockClear();

    component.openDeleteModal(client(1, 'Alfa'));
    component.confirmDeleteClient();
    fixture.detectChanges();

    expect(element.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(element.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toContain('Cliente possui ordens de serviço vinculadas.');
    expect(listClients).not.toHaveBeenCalled();
  });
});

describe('ClientsComponent dialog focus', () => {
  let fixture: ComponentFixture<App>;
  let element: HTMLElement;
  let loading: LoadingService;
  let rows: ClientResponse[];
  let save: Subject<ClientResponse>;
  let remove: Subject<void>;
  let restoreModality: () => void;

  beforeEach(async () => {
    // Under the real root, whose blocker takes focus on showModal() as in a browser.
    restoreModality = simulateNativeModality();
    rows = [client(1, 'Alfa'), client(2, 'Beta')];
    await TestBed.configureTestingModule({
      imports: [ClientsComponent],
      providers: [provideRouter([{ path: '', component: ClientsComponent }]), { provide: CatalogService, useValue: {
        listClients: (filters: ClientFilters) => of(page(rows, filters.page, filters.size)),
        getClientSummary: () => of({ total: rows.length, withContact: 0, withDocument: 0, withEmail: 0 }),
        createClient: () => (save = new Subject<ClientResponse>()),
        updateClient: () => (save = new Subject<ClientResponse>()),
        deleteClient: () => (remove = new Subject<void>())
      } }]
    }).compileComponents();
    ({ fixture, element } = await mountUnderRoot(ClientsComponent));
    vi.useFakeTimers();
    loading = TestBed.inject(LoadingService);
    render();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    restoreModality();
  });

  function render(): void {
    fixture.detectChanges();
    TestBed.tick();
  }

  function find(selector: string): HTMLElement {
    const found = element.querySelector<HTMLElement>(selector);
    expect(found, selector + ' must exist').not.toBeNull();
    return found!;
  }

  function activate(selector: string): HTMLButtonElement {
    const trigger = find(selector) as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    render();
    return trigger;
  }

  function escape(): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(event);
    render();
    return event;
  }

  function fillAndSubmit(): void {
    const name = find('[formControlName="legalName"]') as HTMLInputElement;
    name.value = 'Gama';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    find('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    render();
  }

  function showOverlay(): void {
    loading.start();
    vi.advanceTimersByTime(200);
    render();
    expect(blocker().open, 'the root blocker is shown').toBe(true);
    const dialog = element.querySelector('[role="dialog"], [role="alertdialog"]');
    expect(dialog?.contains(document.activeElement) ?? false, 'the blocker took focus away from the dialog').toBe(false);
  }

  function blocker(): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog.global-loading-dialog')!;
  }

  function hideOverlay(): void {
    loading.finish();
    vi.advanceTimersByTime(400);
    render();
  }

  it('focuses Razão social from Novo cliente and returns to it on Escape', () => {
    const trigger = activate('.page-heading button');
    expect(document.activeElement).toBe(find('[formControlName="legalName"]'));
    expect(escape().defaultPrevented).toBe(true);
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('focuses Cancelar in the delete confirmation and returns to the row action on Escape', () => {
    const trigger = activate('button[aria-label="Excluir Alfa"]');
    const cancel = find('[role="alertdialog"] .form-actions .button-secondary');
    expect(cancel.textContent?.trim()).toBe('Cancelar');
    expect(document.activeElement).toBe(cancel);
    escape();
    expect(element.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('ignores Escape while the client is being saved', () => {
    activate('.page-heading button');
    fillAndSubmit();
    escape();
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    save.next(client(3, 'Gama'));
    save.complete();
    render();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('ignores Escape while the client is being deleted', () => {
    activate('button[aria-label="Excluir Alfa"]');
    find('[role="alertdialog"] .button-primary--danger').click();
    render();
    escape();
    expect(element.querySelector('[role="alertdialog"]')).not.toBeNull();
    remove.error(new HttpErrorResponse({ status: 409, error: { message: 'Vinculado.' } }));
    render();
  });

  it('returns to Novo cliente only after the global overlay hides when the save succeeds under it', () => {
    const trigger = activate('.page-heading button');
    fillAndSubmit();
    showOverlay();
    const focus = vi.spyOn(trigger, 'focus');
    rows = [...rows, client(3, 'Gama')];
    save.next(client(3, 'Gama'));
    save.complete();
    render();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    hideOverlay();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it('gives focus back to the focused field when the overlay hides with the dialog still open', () => {
    activate('.page-heading button');
    const name = find('[formControlName="legalName"]');
    expect(document.activeElement).toBe(name);
    fillAndSubmit();
    showOverlay();
    save.error(new HttpErrorResponse({ status: 500, error: { message: 'Falhou.' } }));
    render();
    hideOverlay();
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(name);
  });

  it('falls back to Novo cliente after the deleted row disappears, once the overlay hides', () => {
    activate('button[aria-label="Excluir Alfa"]');
    find('[role="alertdialog"] .button-primary--danger').click();
    render();
    showOverlay();
    rows = [client(2, 'Beta')];
    remove.next();
    remove.complete();
    render();
    expect(element.querySelector('button[aria-label="Excluir Alfa"]')).toBeNull();
    const fallback = find('.page-heading button');
    expect(document.activeElement).not.toBe(fallback);
    hideOverlay();
    expect(document.activeElement).toBe(fallback);
  });
});

interface ClientsHarness {
  form: FormGroup;
  closeModal(): void;
  updateSearch(value: string): void;
  updateDocumentFilter(value: PresenceFilter): void;
  updateEmailFilter(value: PresenceFilter): void;
  goToPage(page: number): void;
  changePageSize(size: number): void;
  openCreateModal(): void;
  openDeleteModal(client: ClientResponse): void;
  confirmDeleteClient(): void;
}

function expectPending(root: HTMLElement): void {
  const busy = root.querySelector('[aria-busy="true"]');
  expect(busy?.textContent?.trim()).toBe('');
  expect(busy?.children.length).toBe(0);
  expect(root.textContent).not.toContain('Carregando');
}
