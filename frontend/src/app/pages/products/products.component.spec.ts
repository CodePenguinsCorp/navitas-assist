import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PageResponse, ProductResponse, ProductSummaryResponse } from '../../core/models';
import { CatalogService, ProductFilters } from '../../core/services/catalog.service';
import { PresenceFilter } from '../../core/utils/catalog-ui';
import { CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { ProductsComponent } from './products.component';

const INITIAL_PRODUCTS: ProductResponse[] = [
  { id: 1, sku: 'A', name: 'Controlador Alfa', category: 'Controle', hardwareVersion: null,
    firmwareVersion: '1.0', defaultWarrantyMonths: 12, technicalNotes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' },
  { id: 2, sku: 'B', name: 'Controlador Beta', category: 'controle', hardwareVersion: null,
    firmwareVersion: null, defaultWarrantyMonths: 12, technicalNotes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' },
  { id: 3, sku: 'C', name: 'Sensor Gama', category: 'Sensor', hardwareVersion: null,
    firmwareVersion: ' ', defaultWarrantyMonths: 12, technicalNotes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' }
];


function product(id: number, name: string): ProductResponse {
  return {
    id, sku: `SKU-${id}`, name, category: 'Controle', hardwareVersion: null, firmwareVersion: null,
    defaultWarrantyMonths: 12, technicalNotes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  };
}

function page(content: ProductResponse[], pageNumber = 0, size = 20, totalElements = content.length): PageResponse<ProductResponse> {
  return { content, page: pageNumber, size, totalElements, totalPages: Math.ceil(totalElements / size) };
}

const EMPTY_FILTERS = { query: '', category: '', hasFirmware: undefined };

describe('ProductsComponent pagination', () => {
  let component: ProductsHarness;
  let fixture: ComponentFixture<ProductsComponent>;
  let listProducts: ReturnType<typeof vi.fn>;
  let getProductSummary: ReturnType<typeof vi.fn>;
  let summary: ProductSummaryResponse;

  beforeEach(async () => {
    vi.useFakeTimers();
    summary = { total: 45, withFirmware: 20, averageWarrantyMonths: 18, categories: ['Controle', 'Sensor'] };
    listProducts = vi.fn((filters: ProductFilters) => of(page([product(1, 'Alfa'), product(2, 'Beta')], filters.page, filters.size, 45)));
    getProductSummary = vi.fn(() => of(summary));

    await TestBed.configureTestingModule({
      imports: [ProductsComponent],
      providers: [{ provide: CatalogService, useValue: {
        listProducts,
        getProductSummary,
        deleteProduct: () => of(undefined),
        createProduct: () => of(product(9, 'Novo')),
        updateProduct: () => of(product(1, 'Alfa'))
      } }]
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsComponent);
    component = fixture.componentInstance as unknown as ProductsHarness;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('loads the first page, total and category options from the backend summary', () => {
    expect(listProducts).toHaveBeenLastCalledWith({ page: 0, size: 20, ...EMPTY_FILTERS });
    expect(component.categoryFilterOptions().map((option) => option.label)).toEqual(['Todas', 'Controle', 'Sensor']);
    expect(fixture.nativeElement.textContent).toContain('45 registro(s)');
    expect(fixture.nativeElement.textContent).toContain('Página 1 de 3');
    expect(fixture.nativeElement.querySelector('.stat-card')).toBeNull();
    expect(getProductSummary).toHaveBeenCalledTimes(1);
  });

  it('sends category and firmware filters to the backend and resets to the first page', () => {
    component.goToPage(2);
    component.updateCategoryFilter('Sensor');
    expect(listProducts).toHaveBeenLastCalledWith({ page: 0, size: 20, ...EMPTY_FILTERS, category: 'Sensor' });

    component.updateFirmwareFilter('without');
    expect(listProducts).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', category: 'Sensor', hasFirmware: false });
  });

  it('keeps filters while navigating and when the page size changes', () => {
    component.updateFirmwareFilter('with');
    component.goToPage(1);
    expect(listProducts).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', category: '', hasFirmware: true });

    component.changePageSize(10);
    expect(listProducts).toHaveBeenLastCalledWith({ page: 0, size: 10, query: '', category: '', hasFirmware: true });
  });

  it('debounces the text search', () => {
    listProducts.mockClear();
    component.updateSearch('be');
    component.updateSearch('beta');
    expect(listProducts).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(listProducts).toHaveBeenCalledTimes(1);
    expect(listProducts).toHaveBeenLastCalledWith({ page: 0, size: 20, ...EMPTY_FILTERS, query: 'beta' });
  });

  it('clears a category that no longer exists after the summary is refreshed', () => {
    component.updateCategoryFilter('Sensor');
    summary = { ...summary, categories: ['Controle'] };

    component.openDeleteModal(product(3, 'Sensor Gama'));
    component.confirmDeleteProduct();

    expect(component.categoryFilter()).toBe('');
    expect(listProducts).toHaveBeenLastCalledWith({ page: 0, size: 20, ...EMPTY_FILTERS });
  });

  it('shows Cancelar before the primary action in the form dialog', () => {
    component.openCreateModal();
    fixture.detectChanges();

    expectCancelBeforePrimary(fixture.nativeElement);
  });

  it('shows Cancelar before the delete action', () => {
    component.openDeleteModal(product(1, 'Alfa'));
    fixture.detectChanges();

    expectCancelBeforePrimary(fixture.nativeElement);
  });
});

describe('ProductsComponent collection layout and states', () => {
  let fixture: ComponentFixture<ProductsComponent>;
  let component: ProductsHarness;
  let element: HTMLElement;
  let listProducts: ReturnType<typeof vi.fn>;
  let getProductSummary: ReturnType<typeof vi.fn>;
  let deleteProduct: ReturnType<typeof vi.fn>;

  const summary: ProductSummaryResponse = { total: 45, withFirmware: 20, averageWarrantyMonths: 18, categories: ['Controle', 'Sensor'] };
  const loadError = () => throwError(() => new HttpErrorResponse({ status: 503, error: { message: 'Serviço indisponível.' } }));

  async function mount(options: {
    list?: (filters: ProductFilters) => Observable<PageResponse<ProductResponse>>;
    summary?: () => Observable<unknown>;
  } = {}): Promise<void> {
    vi.useFakeTimers();
    listProducts = vi.fn(options.list ?? ((filters: ProductFilters) =>
      of(page([product(1, 'Alfa'), product(2, 'Beta')], filters.page, filters.size, 45))));
    getProductSummary = vi.fn(options.summary ?? (() => of(summary)));
    deleteProduct = vi.fn(() => of(undefined));

    await TestBed.configureTestingModule({
      imports: [ProductsComponent],
      providers: [{ provide: CatalogService, useValue: {
        listProducts,
        getProductSummary,
        deleteProduct,
        createProduct: () => of(product(9, 'Novo')),
        updateProduct: () => of(product(1, 'Alfa'))
      } }]
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsComponent);
    component = fixture.componentInstance as unknown as ProductsHarness;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  const count = () => element.querySelector('.result-count')?.textContent?.trim() ?? null;
  const loadAlert = () => element.querySelector('.table-card [role="alert"]');
  const buttonByText = (text: string) => Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent?.trim() === text);
  const listOf = (...products: ProductResponse[]) =>
    (filters: ProductFilters) => of(page(products, filters.page, filters.size, products.length));

  function expectFailureState(): void {
    expect(loadAlert()?.textContent).toContain('Não foi possível carregar os produtos.');
    expect(buttonByText('Tentar novamente')).toBeDefined();
    expect(element.textContent).not.toContain('Nenhum produto cadastrado');
    expect(element.querySelector('tbody')).toBeNull();
    expect(element.querySelector('app-pagination')).toBeNull();
    expect(count()).toBeNull();
  }

  it('shows the total next to the title', async () => {
    await mount({ list: (filters) => of(page([product(1, 'Alfa')], filters.page, filters.size, filters.category ? 7 : 45)) });
    expect(count()).toBe('45 produtos');
    expect(element.querySelector('.search-field')?.textContent).not.toContain('registro(s)');

    component.updateCategoryFilter('Sensor');
    fixture.detectChanges();
    expect(count()).toBe('7 de 45 produtos');
  });

  it('shows only the count when the summary is unavailable', async () => {
    await mount({
      list: (filters) => of(page([product(1, 'Alfa')], filters.page, filters.size, filters.hasFirmware ? 7 : 45)),
      summary: loadError
    });
    component.updateFirmwareFilter('with');
    fixture.detectChanges();
    expect(count()).toBe('7 produtos');
  });

  it('removes statistics cards', async () => {
    await mount();
    expect(element.querySelector('.stats-grid')).toBeNull();
    expect(element.querySelector('.stat-card')).toBeNull();
    expect(element.textContent).not.toContain('Garantia média');
  });

  it('shows hardware and firmware as separate labeled values', async () => {
    await mount({ list: listOf(
      { ...product(1, 'Ambos'), hardwareVersion: 'R2', firmwareVersion: '3.1' },
      { ...product(2, 'Só firmware'), firmwareVersion: '1.0' },
      { ...product(3, 'Nenhuma') }
    ) });
    const versionCells = Array.from(element.querySelectorAll('tbody tr')).map((row) => row.querySelectorAll('td')[3]);
    const body = element.querySelector('tbody')!.textContent ?? '';

    expect(element.querySelector('thead')?.textContent).toContain('Versões');
    expect(versionCells[0].textContent).toContain('Hardware');
    expect(versionCells[0].textContent).toContain('R2');
    expect(versionCells[0].textContent).toContain('Firmware');
    expect(versionCells[0].textContent).toContain('3.1');
    expect(versionCells[1].textContent).not.toContain('Hardware');
    expect(versionCells[1].textContent).toContain('Firmware');
    expect(versionCells[2].querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('—');
    expect(versionCells[2].querySelector('.sr-only')?.textContent?.trim()).toBe('Versões não informadas');
    expect(body).not.toContain('HW ');
    expect(body).not.toContain('FW ');
    expect(body).not.toContain(' · ');
  });

  it('renders full category and notes text and leaves truncation to CSS', async () => {
    const longCategory = 'C'.repeat(80);
    const longNotes = 'Observação técnica '.repeat(8).trim();
    await mount({ list: listOf(
      { ...product(1, 'Longo'), category: longCategory, technicalNotes: longNotes },
      { ...product(2, 'Vazio'), category: null, technicalNotes: null }
    ) });
    const [longRow, emptyRow] = Array.from(element.querySelectorAll('tbody tr'));
    const body = element.querySelector('tbody')!.textContent ?? '';

    expect(longRow.textContent).toContain(longCategory);
    expect(longRow.textContent).toContain(longNotes);
    expect(body).not.toContain('…');
    expect(body).not.toContain('Não informada');
    expect(body).not.toContain('Sem observação técnica');
    expect(emptyRow.querySelector('td:nth-child(2) .table-subtitle')).toBeNull();
    expect(emptyRow.querySelectorAll('td')[2].querySelector('.sr-only')?.textContent?.trim()).toBe('Categoria não informada');
  });

  it('uses singular for one month of warranty', async () => {
    await mount({ list: listOf({ ...product(1, 'Um'), defaultWarrantyMonths: 1 }, { ...product(2, 'Doze'), defaultWarrantyMonths: 12 }) });
    const [one, twelve] = Array.from(element.querySelectorAll('tbody tr')).map((row) => row.querySelectorAll('td')[4].textContent?.trim());
    expect(one).toBe('1 mês');
    expect(twelve).toBe('12 meses');
  });

  it('names row actions with the product', async () => {
    await mount();
    const [edit, remove] = Array.from(element.querySelectorAll<HTMLButtonElement>('tbody tr:first-child .row-actions button'));
    expect(element.querySelector('thead')?.textContent).toContain('Ações');
    expect(edit.getAttribute('aria-label')).toBe('Editar Alfa');
    expect(remove.getAttribute('aria-label')).toBe('Excluir Alfa');
    expect(edit.querySelector('[role="tooltip"]')?.textContent?.trim()).toBe('Editar');
    expect(edit.hasAttribute('title')).toBe(false);
    expect(remove.hasAttribute('title')).toBe(false);
  });

  it('groups the form into Identificação, Versões and an untitled warranty and notes section', async () => {
    await mount();
    component.openCreateModal();
    fixture.detectChanges();

    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(element.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)?.textContent?.trim()).toBe('Novo produto');
    const sections = Array.from(dialog.querySelectorAll('fieldset.form-section'));
    expect(sections.map((section) => section.querySelector('legend')?.textContent?.trim()))
      .toEqual(['Identificação', 'Versões', 'Garantia e observações']);
    // The last group's fields already name themselves: its legend stays for screen readers only.
    expect(sections[2].querySelector('legend')?.classList.contains('sr-only')).toBe(true);
    expect(sections[0].querySelector('legend')?.classList.contains('sr-only')).toBe(false);
    const controlsIn = (section: Element) => Array.from(section.querySelectorAll('[formControlName]')).map((node) => node.getAttribute('formControlName'));
    expect(controlsIn(sections[0])).toEqual(['sku', 'name', 'category']);
    expect(controlsIn(sections[1])).toEqual(['hardwareVersion', 'firmwareVersion']);
    expect(controlsIn(sections[2])).toEqual(['defaultWarrantyMonths', 'technicalNotes']);

    const category = sections[0].querySelector<HTMLInputElement>('[formControlName="category"]')!;
    expect(category.type).toBe('text');
    expect(category.getAttribute('list')).toBe('product-categories');
    expect(sections[0].querySelector('datalist#product-categories')).not.toBeNull();
    expect(dialog.textContent).toContain('SKU (máx. 20 caracteres)');
    expect(dialog.textContent).toContain('Categoria (máx. 80 caracteres)');
    expect(dialog.textContent).toContain('Observações técnicas (máx. 1000 caracteres)');
    expect(dialog.textContent).not.toContain('Preencha os dados mínimos');
  });

  it('renders an empty busy container until the first empty response', async () => {
    const pending = new Subject<PageResponse<ProductResponse>>();
    await mount({ list: () => pending });
    expectPending(element);
    expect(element.querySelector('tbody, .table-card .empty-state')).toBeNull();
    expect(element.textContent).not.toContain('Nenhum produto');
    pending.next(page([], 0, 20, 0)); pending.complete(); fixture.detectChanges();
    expect(element.querySelector('[aria-busy="true"]')).toBeNull();
    expect(element.textContent).toContain('Nenhum produto');
  });

  it.each([false, true])('hides old rows and empty state during a filter load (empty=%s)', async (empty) => {
    await mount(empty ? { list: (filters) => of(page([], filters.page, filters.size, 0)) } : {});
    const pending = new Subject<PageResponse<ProductResponse>>();
    listProducts.mockImplementation(() => pending);
    component.updateCategoryFilter('Controle'); fixture.detectChanges();
    expectPending(element);
    expect(element.querySelector('tbody, .table-card .empty-state')).toBeNull();
    expect(element.textContent).not.toContain('Nenhum produto');
  });

  it('shows the failure state on an initial load error', async () => {
    await mount({ list: loadError });
    expectFailureState();
  });

  it('shows the failure state when a reload fails after an empty success', async () => {
    await mount({ list: listOf() });
    expect(element.textContent).toContain('Nenhum produto cadastrado');
    listProducts.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();
  });

  it('shows the failure state when a reload fails after a success with records', async () => {
    await mount();
    listProducts.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();
  });

  it('recovers with Tentar novamente using the same filters and page', async () => {
    await mount({ list: (filters) => of(page([product(1, 'Alfa')], filters.page, filters.size, filters.category ? 30 : 45)) });
    const working = listProducts.getMockImplementation()!;
    component.updateCategoryFilter('Sensor');
    listProducts.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();

    listProducts.mockImplementation(working);
    buttonByText('Tentar novamente')!.click();
    fixture.detectChanges();

    expect(listProducts).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', category: 'Sensor', hasFirmware: undefined });
    expect(loadAlert()).toBeNull();
    expect(element.querySelector('tbody')?.textContent).toContain('Alfa');
    expect(count()).toBe('30 de 45 produtos');
  });

  it('shows a disabled loading retry without the old table or count while the retry is pending, then recovers', async () => {
    await mount();
    expect(count()).toBe('45 produtos');
    listProducts.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();

    const pending = new Subject<PageResponse<ProductResponse>>();
    listProducts.mockImplementation(() => pending);
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

    pending.next(page([product(3, 'Gama')], 1, 20, 45));
    pending.complete();
    fixture.detectChanges();

    expect(loadAlert()).toBeNull();
    expect(element.querySelector('tbody')?.textContent).toContain('Gama');
    expect(count()).toBe('45 produtos');
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
    await mount({ list: (filters) => of(filters.category || filters.query || filters.hasFirmware !== undefined
      ? page([], filters.page, filters.size, 0)
      : page([product(1, 'Alfa')], filters.page, filters.size, 45)) });
    component.changePageSize(10);
    component.updateSearch('alfa');
    vi.advanceTimersByTime(300);
    component.updateFirmwareFilter('with');
    component.updateCategoryFilter('Sensor');
    component.goToPage(3);
    expect(listProducts).toHaveBeenLastCalledWith({ page: 3, size: 10, query: 'alfa', category: 'Sensor', hasFirmware: true });
    component.updateSearch('alfa sensor');
    fixture.detectChanges();
    expect(element.textContent).toContain('Nenhum produto encontrado');
    listProducts.mockClear();

    buttonByText('Limpar busca e filtros')!.click();
    vi.advanceTimersByTime(400);
    fixture.detectChanges();

    expect(listProducts).toHaveBeenCalledTimes(1);
    expect(listProducts).toHaveBeenCalledWith({ page: 0, size: 10, query: '', category: '', hasFirmware: undefined });
    expect(component.categoryFilter()).toBe('');
    expect(element.querySelector<HTMLInputElement>('.search-field input')!.value).toBe('');
    expect(element.querySelector('tbody')?.textContent).toContain('Alfa');
    expect(count()).toBe('45 produtos');
  });

  it('identifies name and SKU in the delete confirmation and shows the error in the dialog', async () => {
    await mount();
    deleteProduct.mockImplementation(() => throwError(() =>
      new HttpErrorResponse({ status: 409, error: { message: 'Produto possui RMAs vinculados.' } })));

    component.openDeleteModal(product(1, 'Alfa'));
    fixture.detectChanges();
    const dialog = element.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('Alfa');
    expect(dialog.textContent).toContain('SKU-1');

    component.confirmDeleteProduct();
    fixture.detectChanges();
    expect(element.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toContain('Produto possui RMAs vinculados.');
  });
});

interface ProductsHarness {
  form: FormGroup;
  closeModal(): void;
  categoryFilter: Signal<string>;
  categoryFilterOptions: Signal<ReadonlyArray<CustomSelectOption<string>>>;
  updateSearch(value: string): void;
  updateCategoryFilter(value: string): void;
  updateFirmwareFilter(value: PresenceFilter): void;
  goToPage(page: number): void;
  changePageSize(size: number): void;
  openCreateModal(): void;
  openDeleteModal(product: ProductResponse): void;
  confirmDeleteProduct(): void;
}

function flushProductLists(http: HttpTestingController, content: unknown[], categories: string[] = []): void {
  http.expectOne(r => r.method === 'GET' && r.url.split('?')[0] === '/api/products').flush({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 });
  http.expectOne('/api/products/summary').flush({ total: content.length, withFirmware: 0, averageWarrantyMonths: 12, categories });
}

describe('ProductsComponent pending save lifecycle', () => {
  let fixture: ComponentFixture<ProductsComponent>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProductsComponent);
    flushProductLists(http, [INITIAL_PRODUCTS[0]], ['Controle', 'Sensor']);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function openEditor(mode: 'create' | 'edit'): void {
    page.querySelector<HTMLButtonElement>(
      mode === 'create' ? '.page-heading button' : '.row-actions button'
    )!.click();
    fixture.detectChanges();
  }

  function enterFields(mode: 'create' | 'edit'): void {
    const enter = (name: string, value: string) => {
      const input = page.querySelector<HTMLInputElement>(`[formControlName="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (mode === 'create') {
      enter('sku', 'SKU-NAV-80');
    }
    enter('name', 'Produto salvo');
  }

  function submitSave(mode: 'create' | 'edit'): TestRequest {
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    const request = http.expectOne({
      method: mode === 'create' ? 'POST' : 'PUT',
      url: mode === 'create' ? '/api/products' : '/api/products/1'
    });
    return request;
  }

  function succeed(request: TestRequest, mode: 'create' | 'edit'): void {
    const saved: ProductResponse = { ...INITIAL_PRODUCTS[0], id: mode === 'create' ? 4 : 1,
      sku: mode === 'create' ? 'SKU-NAV-80' : INITIAL_PRODUCTS[0].sku, name: 'Produto salvo' };
    request.flush(saved);
    flushProductLists(http, 
      mode === 'create' ? [INITIAL_PRODUCTS[0], saved] : [saved]
    );
    fixture.detectChanges();
  }

  function fail(request: TestRequest): void {
    request.flush(
      { timestamp: '2026-10-28T12:00:00Z', status: 400, error: 'Bad Request',
        message: 'Product not saved', details: [] },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();
  }

  describe.each(['create', 'edit'] as const)('%s', (mode) => {
    it.each(['Sensor', 'Robótica'])('suggests existing categories and saves the typed category %s', (category) => {
      openEditor(mode);
      const input = page.querySelector<HTMLInputElement>('[formControlName="category"]')!;
      const suggestions = page.querySelector<HTMLDataListElement>(`datalist[id="${input.getAttribute('list')}"]`);
      expect(suggestions).not.toBeNull();
      expect(Array.from(suggestions!.options, (option) => option.value)).toEqual(['Controle', 'Sensor']);
      if (mode === 'edit') expect(input.value).toBe('Controle');

      enterFields(mode);
      input.value = category;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const request = submitSave(mode);
      expect(request.request.body.category).toBe(category);

      const saved: ProductResponse = { ...INITIAL_PRODUCTS[0], id: mode === 'create' ? 4 : 1,
        sku: mode === 'create' ? 'SKU-NAV-80' : INITIAL_PRODUCTS[0].sku, name: 'Produto salvo', category };
      request.flush(saved);
      const categories = category === 'Robótica' ? ['Controle', 'Robótica', 'Sensor'] : ['Controle', 'Sensor'];
      flushProductLists(http, [saved], categories);
      fixture.detectChanges();
      expect(page.querySelector('.modal-overlay')).toBeNull();

      openEditor(mode);
      const refreshed = page.querySelector<HTMLDataListElement>('datalist')!;
      expect(Array.from(refreshed.options, (option) => option.value)).toEqual(categories);
      if (mode === 'edit') expect(page.querySelector<HTMLInputElement>('[formControlName="category"]')!.value).toBe(category);
    });

    it.each(['overlay', 'close'] as const)('keeps a pending save open through %s and closes on success', (control) => {
      openEditor(mode);
      enterFields(mode);
      const request = submitSave(mode);
      const close = page.querySelector<HTMLButtonElement>('.modal-close')!;
      const closeDisabled = close.disabled;
      const cancelDisabled = page.querySelector<HTMLButtonElement>('form .button-secondary')!.disabled;
      page.querySelector<HTMLElement>(control === 'overlay' ? '.modal-overlay' : '.modal-close')!.click();
      fixture.detectChanges();
      const stillOpen = page.querySelector('.modal-overlay') !== null;
      const cancelled = request.cancelled;
      succeed(request, mode);

      expect(stillOpen).toBe(true);
      expect(closeDisabled).toBe(true);
      expect(cancelDisabled).toBe(true);
      expect(cancelled).toBe(false);
      expect(page.querySelector('.modal-overlay')).toBeNull();
      expect(page.querySelector('tbody')?.textContent).toContain('Produto salvo');
    });

    it('keeps values on failure and allows closing once the request has ended', () => {
      openEditor(mode);
      enterFields(mode);
      fail(submitSave(mode));

      expect(page.querySelector('[role="alert"]')?.textContent).toContain('Product not saved');
      expect(page.querySelector<HTMLInputElement>('[formControlName="name"]')!.value).toBe('Produto salvo');
      expect(page.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(false);
      expect(page.querySelector<HTMLButtonElement>('form .button-secondary')!.disabled).toBe(false);
      page.querySelector<HTMLButtonElement>('.modal-close')!.click();
      fixture.detectChanges();
      expect(page.querySelector('.modal-overlay')).toBeNull();
    });

    it('can retry after a failed save and then closes and refreshes normally', () => {
      openEditor(mode);
      enterFields(mode);
      fail(submitSave(mode));
      const retry = submitSave(mode);
      expect(retry.request.body.name).toBe('Produto salvo');
      expect(page.querySelector('[role="alert"]')).toBeNull();
      succeed(retry, mode);

      expect(page.querySelector('.modal-overlay')).toBeNull();
      expect(page.querySelector('tbody')?.textContent).toContain('Produto salvo');
    });
  });

  it.each(['overlay', 'close'] as const)('preserves idle editor closure through %s', (control) => {
    openEditor('create');
    page.querySelector<HTMLElement>(control === 'overlay' ? '.modal-overlay' : '.modal-close')!.click();
    fixture.detectChanges();
    expect(page.querySelector('.modal-overlay')).toBeNull();
  });

  it('keeps invalid form validation without sending a save request', () => {
    openEditor('create');
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    http.expectNone({ method: 'POST', url: '/api/products' });
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Revise os campos destacados');
    expect(page.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(false);
  });
});

function expectPending(root: HTMLElement): void {
  const busy = root.querySelector('[aria-busy="true"]');
  expect(busy?.textContent?.trim()).toBe('');
  expect(busy?.children.length).toBe(0);
  expect(root.textContent).not.toContain('Carregando');
}
