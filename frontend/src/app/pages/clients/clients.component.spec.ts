import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { ClientRequest, ClientResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { PresenceFilter } from '../../core/utils/catalog-ui';
import { ClientsComponent } from './clients.component';

describe('ClientsComponent pending save lifecycle', () => {
  let fixture: ComponentFixture<ClientsComponent>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ClientsComponent);
    http.expectOne('/api/clients').flush([CLIENTS[0]]);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function openEditor(mode: 'create' | 'edit'): void {
    page.querySelector<HTMLButtonElement>(mode === 'create' ? '.page-heading button' : '.client-actions button')!.click();
    fixture.detectChanges();
  }

  function enterName(): void {
    const name = page.querySelector<HTMLInputElement>('[formControlName="legalName"]')!;
    name.value = 'Cliente salvo';
    name.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function submitSave(mode: 'create' | 'edit'): TestRequest {
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    return http.expectOne({ method: mode === 'create' ? 'POST' : 'PUT', url: mode === 'create' ? '/api/clients' : '/api/clients/1' });
  }

  function succeed(request: TestRequest, mode: 'create' | 'edit'): void {
    const saved: ClientResponse = { ...CLIENTS[0], id: mode === 'create' ? 4 : 1, legalName: 'Cliente salvo' };
    request.flush(saved);
    http.expectOne({ method: 'GET', url: '/api/clients' }).flush(mode === 'create' ? [CLIENTS[0], saved] : [saved]);
    fixture.detectChanges();
  }

  function fail(request: TestRequest): void {
    request.flush({ timestamp: '2026-10-28T12:00:00Z', status: 400, error: 'Bad Request', message: 'Client not saved', details: [] },
      { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
  }

  describe.each(['create', 'edit'] as const)('%s', (mode) => {
    it.each(['overlay', 'close'] as const)('keeps the pending editor open through %s and closes after success', (control) => {
      openEditor(mode);
      enterName();
      const request = submitSave(mode);
      const close = page.querySelector<HTMLButtonElement>('.modal-close')!;
      const closeDisabled = close.disabled;
      const cancelDisabled = page.querySelector<HTMLButtonElement>('form .button-secondary')!.disabled;
      if (control === 'overlay') {
        page.querySelector<HTMLElement>('.modal-overlay')!.click();
      } else {
        close.click();
      }
      fixture.detectChanges();
      const stillOpen = page.querySelector('.modal-overlay') !== null;
      const cancelled = request.cancelled;
      succeed(request, mode);

      expect(stillOpen).toBe(true);
      expect(closeDisabled).toBe(true);
      expect(cancelDisabled).toBe(true);
      expect(cancelled).toBe(false);
      expect(page.querySelector('.modal-overlay')).toBeNull();
      expect(page.querySelector('tbody')?.textContent).toContain('Cliente salvo');
    });

    it('keeps values on failure and allows closing once the request has ended', () => {
      openEditor(mode);
      enterName();
      fail(submitSave(mode));

      expect(page.querySelector('[role="alert"]')?.textContent).toContain('Client not saved');
      expect(page.querySelector<HTMLInputElement>('[formControlName="legalName"]')!.value).toBe('Cliente salvo');
      expect(page.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(false);
      expect(page.querySelector<HTMLButtonElement>('form .button-secondary')!.disabled).toBe(false);
      page.querySelector<HTMLButtonElement>('.modal-close')!.click();
      fixture.detectChanges();
      expect(page.querySelector('.modal-overlay')).toBeNull();
    });

    it('can retry after a failed save and then closes and refreshes normally', () => {
      openEditor(mode);
      enterName();
      fail(submitSave(mode));
      const retry = submitSave(mode);
      expect(retry.request.body.legalName).toBe('Cliente salvo');
      expect(page.querySelector('[role="alert"]')).toBeNull();
      succeed(retry, mode);

      expect(page.querySelector('.modal-overlay')).toBeNull();
      expect(page.querySelector('tbody')?.textContent).toContain('Cliente salvo');
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
    http.expectNone({ method: 'POST', url: '/api/clients' });
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Revise os campos destacados');
    expect(page.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(false);
  });
});

const CLIENTS: ClientResponse[] = [
  {
    id: 1, legalName: 'Alfa', tradeName: null, documentNumber: '123', contactName: null,
    email: 'alfa@example.com', phone: null, address: null, notes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  },
  {
    id: 2, legalName: 'Beta', tradeName: null, documentNumber: null, contactName: null,
    email: 'beta@example.com', phone: null, address: null, notes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  },
  {
    id: 3, legalName: 'Gama', tradeName: null, documentNumber: '456', contactName: null,
    email: '   ', phone: null, address: null, notes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  }
];

describe('ClientsComponent filters', () => {
  let component: ClientsHarness;
  let fixture: ComponentFixture<ClientsComponent>;
  let clients: ClientResponse[];

  beforeEach(async () => {
    clients = [...CLIENTS];
    await TestBed.configureTestingModule({
      imports: [ClientsComponent],
      providers: [{ provide: CatalogService, useValue: {
        listClients: () => of(clients),
        createClient: (request: ClientRequest) => {
          const client: ClientResponse = { ...request, id: 4,
            createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };
          clients = [...clients, client];
          return of(client);
        },
        updateClient: (id: number, request: ClientRequest) => {
          const client: ClientResponse = { ...request, id,
            createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };
          clients = clients.map((current) => current.id === id ? client : current);
          return of(client);
        },
        deleteClient: (id: number) => {
          clients = clients.filter((client) => client.id !== id);
          return of(undefined);
        }
      } }]
    }).compileComponents();

    fixture = TestBed.createComponent(ClientsComponent);
    component = fixture.componentInstance as unknown as ClientsHarness;
    fixture.detectChanges();
  });

  it('combines text, document and email filters and updates the result count', () => {
    component.updateDocumentFilter('with');
    component.updateEmailFilter('with');
    expect(component.filteredClients().map((client) => client.id)).toEqual([1]);

    component.updateSearch('gama');
    expect(component.filteredClients()).toEqual([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('0 registro(s)');
    expect(fixture.nativeElement.textContent).toContain('Ajuste a busca ou os filtros');

    component.updateEmailFilter('without');
    expect(component.filteredClients().map((client) => client.id)).toEqual([3]);
  });

  it('clears one filter without losing the others', () => {
    component.updateDocumentFilter('without');
    component.updateEmailFilter('with');
    expect(component.filteredClients().map((client) => client.id)).toEqual([2]);

    component.updateDocumentFilter('all');
    expect(component.filteredClients().map((client) => client.id)).toEqual([1, 2]);
    component.updateEmailFilter('all');
    expect(component.filteredClients()).toHaveLength(3);
  });

  it('keeps the filters correct after creating, editing and deleting clients', () => {
    component.updateDocumentFilter('with');
    component.updateEmailFilter('without');
    expect(component.filteredClients().map((client) => client.id)).toEqual([3]);

    component.openCreateModal();
    component.form.patchValue({ legalName: 'Delta', documentNumber: '789' });
    component.saveClient();
    expect(component.filteredClients().map((client) => client.id)).toEqual([4, 3]);

    component.openEditModal(CLIENTS[2]);
    component.form.patchValue({ email: 'gama@example.com' });
    component.saveClient();
    expect(component.filteredClients().map((client) => client.id)).toEqual([4]);

    component.openDeleteModal(clients.find((client) => client.id === 4)!);
    component.confirmDeleteClient();
    expect(component.filteredClients()).toEqual([]);
  });
});

interface ClientsHarness {
  form: FormGroup;
  filteredClients: Signal<ClientResponse[]>;
  updateSearch(value: string): void;
  updateDocumentFilter(value: PresenceFilter): void;
  updateEmailFilter(value: PresenceFilter): void;
  openCreateModal(): void;
  openEditModal(client: ClientResponse): void;
  saveClient(): void;
  openDeleteModal(client: ClientResponse): void;
  confirmDeleteClient(): void;
}
