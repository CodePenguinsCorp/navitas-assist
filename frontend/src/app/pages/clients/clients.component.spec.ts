import { Signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { ClientRequest, ClientResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { PresenceFilter } from '../../core/utils/catalog-ui';
import { ClientsComponent } from './clients.component';

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
