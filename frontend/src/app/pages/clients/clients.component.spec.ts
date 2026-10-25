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
    ...{ contactName: 'Contato legado reservado' },
    id: 1, legalName: 'Alfa', tradeName: null, documentNumber: '123',
    email: 'alfa@example.com', phone: null, address: null, notes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  },
  {
    id: 2, legalName: 'Beta', tradeName: null, documentNumber: null,
    email: 'beta@example.com', phone: '123', address: null, notes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  },
  {
    id: 3, legalName: 'Gama', tradeName: null, documentNumber: '456',
    email: '   ', phone: null, address: null, notes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  }
];

describe('ClientsComponent filters', () => {
  let component: ClientsHarness;
  let fixture: ComponentFixture<ClientsComponent>;
  let clients: ClientResponse[];
  let lastPayload: ClientRequest | null;

  beforeEach(async () => {
    clients = [...CLIENTS];
    lastPayload = null;
    await TestBed.configureTestingModule({
      imports: [ClientsComponent],
      providers: [{ provide: CatalogService, useValue: {
        listClients: () => of(clients),
        createClient: (request: ClientRequest) => {
          lastPayload = request;
          const client: ClientResponse = { ...request, id: 4,
            createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };
          clients = [...clients, client];
          return of(client);
        },
        updateClient: (id: number, request: ClientRequest) => {
          lastPayload = request;
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

  it('shows contact channels without exposing or searching a legacy contact name', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Contato legado reservado');
    expect(fixture.nativeElement.textContent).toContain('Telefone / e-mail');
    expect(fixture.nativeElement.textContent).toContain('Com telefone');
    expect(component.clientsWithPhone()).toBe(1);
    const rows = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLTableRowElement>;
    expect(rows[1].cells[1].textContent).toContain('123');
    expect(rows[1].cells[1].textContent).toContain('beta@example.com');
    expect(rows[2].cells[1].querySelector('.table-title')?.textContent).toBe('Não informado');
    expect(rows[2].cells[1].querySelector('.table-subtitle')?.textContent).toBe('Não informado');
    component.updateSearch('Contato legado reservado');
    expect(component.filteredClients()).toEqual([]);
  });

  it('omits the contact property from create and update payloads', () => {
    component.openCreateModal();
    component.form.patchValue({ legalName: ' Delta ', phone: ' 123 ', address: ' Rua A ' });
    component.saveClient();
    expect(lastPayload).toEqual({
      legalName: 'Delta', tradeName: null, documentNumber: null, email: null,
      phone: '123', address: 'Rua A', notes: null
    });

    component.openEditModal(CLIENTS[0]);
    component.form.patchValue({ legalName: 'Alfa atualizada' });
    component.saveClient();
    expect(lastPayload).toEqual({
      legalName: 'Alfa atualizada', tradeName: null, documentNumber: '123', email: 'alfa@example.com',
      phone: null, address: null, notes: null
    });
  });

  it('labels the document as CPF/CNPJ and retains native phone and address limits', () => {
    component.openCreateModal();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('CPF/CNPJ');
    expect(element.textContent).not.toContain('CNPJ/CPF');
    expect(element.textContent).not.toContain('Até 120 caracteres, sem contar espaços e traços.');
    expect(element.querySelector('input[formControlName="contactName"]')).toBeNull();
    expect(element.querySelector<HTMLInputElement>('input[formControlName="phone"]')?.maxLength).toBe(30);
    expect(element.querySelector<HTMLInputElement>('input[formControlName="address"]')?.maxLength).toBe(255);
  });

  it('validates the agreed limits when values are assigned programmatically', () => {
    component.openCreateModal();
    component.form.patchValue({ legalName: 'A -–— '.repeat(119) + 'Z', phone: '1'.repeat(30), address: 'A'.repeat(255) });
    expect(component.form.valid).toBe(true);
    component.form.controls['phone'].setValue('1'.repeat(31));
    expect(component.form.controls['phone'].invalid).toBe(true);
    component.form.controls['phone'].setValue('');
    component.form.controls['address'].setValue('A'.repeat(256));
    expect(component.form.controls['address'].invalid).toBe(true);
    component.form.controls['address'].setValue('');
    component.form.controls['legalName'].setValue('A -'.repeat(121));
    expect(component.form.controls['legalName'].invalid).toBe(true);
  });

  it('limits pasted legal names by significant characters and still explains invalid values', () => {
    component.openCreateModal();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[formControlName="legalName"]') as HTMLInputElement;
    input.value = 'A -'.repeat(121);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('A -'.repeat(120));
    expect(component.form.controls['legalName'].value).toBe('A -'.repeat(120));
    component.form.controls['legalName'].setValue('A'.repeat(121));
    component.form.controls['legalName'].markAsTouched();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Informe a razão social com até 120 caracteres');
  });
});

interface ClientsHarness {
  form: FormGroup;
  filteredClients: Signal<ClientResponse[]>;
  clientsWithPhone: Signal<number>;
  updateSearch(value: string): void;
  updateDocumentFilter(value: PresenceFilter): void;
  updateEmailFilter(value: PresenceFilter): void;
  openCreateModal(): void;
  openEditModal(client: ClientResponse): void;
  saveClient(): void;
  openDeleteModal(client: ClientResponse): void;
  confirmDeleteClient(): void;
}
