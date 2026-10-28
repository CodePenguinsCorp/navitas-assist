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

describe('ProductsComponent HTTP error feedback', () => {
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
    http.expectOne('/api/products').flush([]);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('.page-heading button')!.click();
    fixture.detectChanges();
    for (const [name, value] of [['sku', 'SKU-NAV-81'], ['name', 'Produto salvo']]) {
      const input = page.querySelector<HTMLInputElement>(`[formControlName="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  afterEach(() => http.verify());

  function submitSave(): TestRequest {
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    return http.expectOne({ method: 'POST', url: '/api/products' });
  }

  it.each([
    { label: 'numeric message', body: { message: 500 }, feedback: 'Não foi possível salvar o produto agora.' },
    { label: 'nonarray details', body: { message: 'Saving failed', details: 'wrong' }, feedback: 'Saving failed' },
    { label: 'null body', body: null, feedback: 'Não foi possível salvar o produto agora.' },
    { label: 'valid API error', body: { message: 'Validation failed', details: ['sku: required'] },
      feedback: 'Validation failed: sku: required' },
    { label: 'network failure', body: null, feedback: 'Não foi possível salvar o produto agora.' }
  ])('shows feedback and allows manual retry after $label', ({ label, body, feedback }) => {
    const request = submitSave();
    expect(page.querySelector<HTMLButtonElement>('form .button-primary')!.disabled).toBe(true);
    if (label === 'network failure') {
      request.error(new ProgressEvent('error'));
    } else {
      request.flush(body, { status: 500, statusText: 'Server Error' });
    }
    fixture.detectChanges();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(feedback);
    expect(page.querySelector<HTMLInputElement>('[formControlName="name"]')!.value).toBe('Produto salvo');
    expect(page.querySelector<HTMLButtonElement>('form .button-primary')!.disabled).toBe(false);
    const retry = submitSave();
    expect(retry.request.body.name).toBe('Produto salvo');
    expect(page.querySelector('[role="alert"]')).toBeNull();
    const saved: ProductResponse = { ...INITIAL_PRODUCTS[0], sku: 'SKU-NAV-81', name: 'Produto salvo' };
    retry.flush(saved);
    http.expectOne({ method: 'GET', url: '/api/products' }).flush([saved]);
    fixture.detectChanges();
    expect(page.querySelector('.modal-overlay')).toBeNull();
    expect(page.querySelector('tbody')?.textContent).toContain('Produto salvo');
  });
});
