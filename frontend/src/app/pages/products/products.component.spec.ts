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
