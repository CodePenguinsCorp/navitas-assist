import { Signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { PageResponse, ProductResponse, ProductSummaryResponse } from '../../core/models';
import { CatalogService, ProductFilters } from '../../core/services/catalog.service';
import { PresenceFilter } from '../../core/utils/catalog-ui';
import { CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';
import { ProductsComponent } from './products.component';

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
