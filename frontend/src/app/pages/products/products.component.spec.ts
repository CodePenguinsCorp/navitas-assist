import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { PageResponse, ProductResponse, ProductSummaryResponse } from '../../core/models';
import { CatalogService, ProductFilters } from '../../core/services/catalog.service';
import { PresenceFilter } from '../../core/utils/catalog-ui';
import { CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';
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
    expect(fixture.nativeElement.textContent).toContain('18 meses');
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
});

interface ProductsHarness {
  form: FormGroup;
  categoryFilter: Signal<string>;
  categoryFilterOptions: Signal<ReadonlyArray<CustomSelectOption<string>>>;
  updateSearch(value: string): void;
  updateCategoryFilter(value: string): void;
  updateFirmwareFilter(value: PresenceFilter): void;
  goToPage(page: number): void;
  changePageSize(size: number): void;
  openDeleteModal(product: ProductResponse): void;
  confirmDeleteProduct(): void;
}

function flushProductLists(http: HttpTestingController, content: unknown[]): void {
  http.expectOne(r => r.method === 'GET' && r.url.split('?')[0] === '/api/products').flush({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 });
  http.expectOne('/api/products/summary').flush({ total: content.length, withFirmware: 0, averageWarrantyMonths: 12, categories: [] });
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
    flushProductLists(http, [INITIAL_PRODUCTS[0]]);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function openEditor(mode: 'create' | 'edit'): void {
    page.querySelector<HTMLButtonElement>(
      mode === 'create' ? '.page-heading button' : '.product-actions button'
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
