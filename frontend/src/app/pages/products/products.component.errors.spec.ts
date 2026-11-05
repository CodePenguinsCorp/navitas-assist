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
    http.expectOne(r => r.method === 'GET' && r.url.split('?')[0] === '/api/products').flush({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 1 });
    http.expectOne('/api/products/summary').flush({ total: 1, withFirmware: 0, averageWarrantyMonths: 12, categories: [] });
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
    http.expectOne(r => r.method === 'GET' && r.url.split('?')[0] === '/api/products').flush({ content: [saved], page: 0, size: 20, totalElements: 1, totalPages: 1 });
    http.expectOne('/api/products/summary').flush({ total: 1, withFirmware: 0, averageWarrantyMonths: 12, categories: [] });
    fixture.detectChanges();
    expect(page.querySelector('.modal-overlay')).toBeNull();
    expect(page.querySelector('tbody')?.textContent).toContain('Produto salvo');
  });
});
