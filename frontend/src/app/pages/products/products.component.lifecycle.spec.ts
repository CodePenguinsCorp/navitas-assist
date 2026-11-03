import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductResponse } from '../../core/models';
import { ProductsComponent } from './products.component';

const INITIAL_PRODUCTS: ProductResponse[] = [
  { id: 1, sku: 'A', name: 'Controlador Alfa', category: 'Controle', hardwareVersion: null,
    firmwareVersion: '1.0', defaultWarrantyMonths: 12, technicalNotes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' }
];

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
    flushLoad([INITIAL_PRODUCTS[0]]);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function flushLoad(content: ProductResponse[]): void {
    http.expectOne((request) => request.method === 'GET' && request.url === '/api/products').flush(
      { content, page: 0, size: 20, totalElements: content.length, totalPages: 1 }
    );
    http.expectOne('/api/products/summary').flush(
      { total: content.length, withFirmware: 1, averageWarrantyMonths: 12, categories: ['Controle'] }
    );
  }

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
    flushLoad(mode === 'create' ? [INITIAL_PRODUCTS[0], saved] : [saved]);
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
