import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClientResponse, ProductResponse, UserAccountResponse } from '../core/models';
import { AuthService } from '../core/services/auth.service';
import { ClientsComponent } from './clients/clients.component';
import { ProductsComponent } from './products/products.component';
import { UsersComponent } from './users/users.component';

type Mode = 'create' | 'edit';
type CatalogResponse = ClientResponse | ProductResponse | UserAccountResponse;
interface CatalogCase {
  kind: 'clients' | 'products' | 'users';
  component: Type<unknown>;
  endpoint: string;
  seed: CatalogResponse;
  fields: Record<string, string>;
  uniqueControl: string;
}

const timestamps = { createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };
const client: ClientResponse = {
  id: 1, legalName: 'Cliente existente', tradeName: null, documentNumber: null, contactName: null,
  email: null, phone: null, address: null, notes: null, ...timestamps
};
const product: ProductResponse = {
  id: 2, sku: 'EXISTING-SKU', name: 'Produto existente', category: null, hardwareVersion: null,
  firmwareVersion: null, defaultWarrantyMonths: 12, technicalNotes: null, ...timestamps
};
const user: UserAccountResponse = {
  id: 3, username: 'existing.user', fullName: 'Usuário existente', role: 'TECHNICIAN', active: true, ...timestamps
};
const catalogs: CatalogCase[] = [
  { kind: 'clients', component: ClientsComponent, endpoint: '/api/clients', seed: client,
    fields: { legalName: 'Novo cliente' }, uniqueControl: 'legalName' },
  { kind: 'products', component: ProductsComponent, endpoint: '/api/products', seed: product,
    fields: { sku: 'NEW-SKU', name: 'Novo produto' }, uniqueControl: 'sku' },
  { kind: 'users', component: UsersComponent, endpoint: '/api/users', seed: user,
    fields: { username: 'new.user', fullName: 'Novo usuário' }, uniqueControl: 'username' }
];

for (const catalog of catalogs) {
  describe(catalog.kind + ' pending submissions', () => {
    let fixture: ComponentFixture<unknown>;
    let http: HttpTestingController;
    let page: HTMLElement;
    let records: CatalogResponse[];
    let nextCreatedId: number;
    let expectedFields: Record<string, string>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [catalog.component],
        providers: [provideHttpClient(), provideHttpClientTesting()]
      }).compileComponents();
      http = TestBed.inject(HttpTestingController);
      TestBed.inject(AuthService).restoreSession().subscribe();
      http.expectOne('/api/auth/me').flush({
        id: 99, username: 'tester-admin', fullName: 'Administrador', role: 'ADMIN', active: true, ...timestamps
      });
      records = [catalog.seed];
      nextCreatedId = 10;
      fixture = TestBed.createComponent<unknown>(catalog.component);
      http.expectOne(catalog.endpoint).flush(records);
      fixture.detectChanges();
      page = fixture.nativeElement as HTMLElement;
    });

    afterEach(() => http.verify());

    function enter(controlName: string, value: string): void {
      const input = page.querySelector<HTMLInputElement>('.modal-overlay [formControlName="' + controlName + '"]')!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }

    function open(mode: Mode, valid = true, suffix = ''): void {
      const trigger = mode === 'create'
        ? page.querySelector<HTMLButtonElement>('.page-heading .button-primary')!
        : Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === 'Editar')!;
      trigger.click();
      fixture.detectChanges();
      if (!valid) {
        enter(catalog.uniqueControl, '');
        return;
      }
      expectedFields = {};
      for (const [control, value] of Object.entries(catalog.fields)) {
        const inputValue = control === catalog.uniqueControl ? value + suffix : value;
        enter(control, inputValue);
        expectedFields[control] = inputValue;
      }
      if (catalog.kind === 'users' && mode === 'create') enter('password', 'test-password');
    }

    function match(mode: Mode): { method: string; url: string } {
      return { method: mode === 'create' ? 'POST' : 'PUT',
        url: mode === 'create' ? catalog.endpoint : catalog.endpoint + '/' + catalog.seed.id };
    }

    function submitButton(): HTMLButtonElement {
      return page.querySelector<HTMLButtonElement>('.modal-overlay button[type="submit"]')!;
    }

    function submit(): void {
      page.querySelector('.modal-overlay form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    }

    function succeed(request: TestRequest, mode: Mode): void {
      expect(request.request.body).toMatchObject(expectedFields);
      if (catalog.kind === 'users') {
        expect(request.request.body.password).toBe(mode === 'create' ? 'test-password' : null);
      }
      const responseFields = Object.fromEntries(Object.entries(request.request.body).filter(([key]) => key !== 'password'));
      const saved = { ...catalog.seed, ...responseFields, id: mode === 'create' ? nextCreatedId++ : catalog.seed.id };
      records = mode === 'create' ? [...records, saved] : records.map((record) => record.id === saved.id ? saved : record);
      request.flush(saved);
      http.expectOne({ method: 'GET', url: catalog.endpoint }).flush(records);
      fixture.detectChanges();
      expect(page.querySelector('.modal-overlay')).toBeNull();
      expect(page.textContent).toContain(mode === 'create' ? 'cadastrado com sucesso' : 'atualizado com sucesso');
    }

    it.each(['create', 'edit'] as const)('ignores repeated %s submissions while the first request is pending', (mode) => {
      open(mode);
      submit();
      const first = http.expectOne(match(mode));
      expect(submitButton().disabled).toBe(true);
      submit();
      const duplicates = http.match(match(mode));
      for (const duplicate of duplicates) {
        duplicate.flush({ message: 'Duplicate request' }, { status: 500, statusText: 'Server Error' });
      }
      if (duplicates.length) {
        first.flush({ message: 'Pending request cleanup' }, { status: 500, statusText: 'Server Error' });
        fixture.detectChanges();
      }
      expect(duplicates).toHaveLength(0);
      expect(first.cancelled).toBe(false);
      expect(submitButton().disabled).toBe(true);
      succeed(first, mode);
    });

    it.each(['create', 'edit'] as const)('allows manual %s retry after an error without losing the payload', (mode) => {
      open(mode);
      submit();
      const first = http.expectOne(match(mode));
      const payload = first.request.body;
      first.flush({ message: 'Falha temporária' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(submitButton().disabled).toBe(false);
      expect(page.textContent).toContain('Falha temporária');
      expect(page.querySelector('.modal-overlay')).not.toBeNull();
      submit();
      const retry = http.expectOne(match(mode));
      expect(retry.request.body).toEqual(payload);
      succeed(retry, mode);
    });

    it.each(['create', 'edit'] as const)('allows a new %s operation after a successful one', (mode) => {
      open(mode);
      submit();
      succeed(http.expectOne(match(mode)), mode);
      open(mode, true, '-next');
      expect(submitButton().disabled).toBe(false);
      submit();
      succeed(http.expectOne(match(mode)), mode);
    });

    it.each(['create', 'edit'] as const)('does not send or lock an invalid %s form', (mode) => {
      open(mode, false);
      submit();
      http.expectNone(match(mode));
      expect(submitButton().disabled).toBe(false);
      expect(page.querySelector('.modal-overlay')).not.toBeNull();
    });
  });
}
