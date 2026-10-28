import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { ProductRequest, ProductResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
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

describe('ProductsComponent filters', () => {
  let component: ProductsHarness;
  let fixture: ComponentFixture<ProductsComponent>;
  let products: ProductResponse[];

  beforeEach(async () => {
    products = [...INITIAL_PRODUCTS];
    await TestBed.configureTestingModule({
      imports: [ProductsComponent],
      providers: [{ provide: CatalogService, useValue: {
        listProducts: () => of(products),
        deleteProduct: (id: number) => {
          products = products.filter((product) => product.id !== id);
          return of(undefined);
        },
        createProduct: (request: ProductRequest) => {
          const product: ProductResponse = { ...request, id: 4,
            createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };
          products = [...products, product];
          return of(product);
        },
        updateProduct: (id: number, request: ProductRequest) => {
          const product: ProductResponse = { ...request, id,
            createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };
          products = products.map((current) => current.id === id ? product : current);
          return of(product);
        }
      } }]
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsComponent);
    component = fixture.componentInstance as unknown as ProductsHarness;
    fixture.detectChanges();
  });

  it('combines text, category and firmware filters with unique category options', () => {
    expect(component.categoryFilterOptions().map((option) => option.label)).toEqual([
      'Todas', 'Controle', 'Sensor'
    ]);
    component.updateCategoryFilter('Controle');
    component.updateFirmwareFilter('with');
    expect(component.filteredProducts().map((product) => product.id)).toEqual([1]);

    component.updateSearch('beta');
    expect(component.filteredProducts()).toEqual([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('0 registro(s)');

    component.updateFirmwareFilter('without');
    expect(component.filteredProducts().map((product) => product.id)).toEqual([2]);
    component.updateCategoryFilter('');
    expect(component.filteredProducts().map((product) => product.id)).toEqual([2]);
  });

  it('keeps valid categories and clears a category removed by deletion', () => {
    component.updateCategoryFilter('Controle');
    component.openDeleteModal(INITIAL_PRODUCTS[0]);
    component.confirmDeleteProduct();
    expect(component.categoryFilter()).toBe('controle');
    expect(component.filteredProducts().map((product) => product.id)).toEqual([2]);

    component.openDeleteModal(INITIAL_PRODUCTS[1]);
    component.confirmDeleteProduct();
    expect(component.categoryFilter()).toBe('');
    expect(component.filteredProducts().map((product) => product.id)).toEqual([3]);
  });

  it('updates category options after creation and resets a category removed by editing', () => {
    component.openCreateModal();
    component.form.patchValue({ sku: 'D', name: 'Roteador', category: 'Rede' });
    component.saveProduct();
    expect(component.categoryFilterOptions().map((option) => option.value)).toContain('Rede');

    component.updateCategoryFilter('Sensor');
    component.openEditModal(INITIAL_PRODUCTS[2]);
    component.form.patchValue({ category: 'Rede' });
    component.saveProduct();
    expect(component.categoryFilter()).toBe('');
    expect(component.filteredProducts()).toHaveLength(4);
  });
});

interface ProductsHarness {
  form: FormGroup;
  filteredProducts: Signal<ProductResponse[]>;
  categoryFilter: Signal<string>;
  categoryFilterOptions: Signal<ReadonlyArray<CustomSelectOption<string>>>;
  updateSearch(value: string): void;
  updateCategoryFilter(value: string): void;
  updateFirmwareFilter(value: PresenceFilter): void;
  openCreateModal(): void;
  openEditModal(product: ProductResponse): void;
  saveProduct(): void;
  openDeleteModal(product: ProductResponse): void;
  confirmDeleteProduct(): void;
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
    http.expectOne('/api/products').flush([INITIAL_PRODUCTS[0]]);
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
    http.expectOne({ method: 'GET', url: '/api/products' }).flush(
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
