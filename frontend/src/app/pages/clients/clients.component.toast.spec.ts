import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ClientRequest, ClientResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastOutletComponent } from '../../shared/toast-outlet/toast-outlet.component';
import { providePermissions } from '../../testing/permission-fixtures';
import { toastMessages, toastTones } from '../../testing/toast';
import { ClientsComponent } from './clients.component';

const client = (id: number, legalName: string): ClientResponse => ({
  id, legalName, tradeName: null, documentNumber: null, email: null, phone: null, address: null, notes: null, updatedAt: '2026-10-20T12:00:00Z'
});

interface Harness {
  form: { patchValue(value: unknown): void };
  openCreateModal(): void;
  openEditModal(client: ClientResponse): void;
  saveClient(): void;
  openDeleteModal(client: ClientResponse): void;
  confirmDeleteClient(): void;
}

describe('ClientsComponent avisos de sucesso', () => {
  async function mount() {
    await TestBed.configureTestingModule({
      imports: [ClientsComponent],
      providers: [provideRouter([]), providePermissions(['cadastros.ver', 'cadastros.editar']), { provide: CatalogService, useValue: {
        listClients: () => of({ content: [client(1, 'Alfa')], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
        getClientSummary: () => of({ total: 1 }),
        getClient: (id: number) => of(client(id, 'Alfa')),
        deleteClient: () => of(undefined),
        createClient: (request: ClientRequest) => of(client(9, request.legalName)),
        updateClient: (id: number, request: ClientRequest) => of(client(id, request.legalName))
      } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(ClientsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as unknown as Harness };
  }

  it('avisa o cadastro em aviso flutuante e não deixa aviso fixo na página', async () => {
    const { fixture, component } = await mount();
    component.openCreateModal();
    component.form.patchValue({ legalName: 'Gama' });
    component.saveClient(); fixture.detectChanges();
    expect(toastMessages()).toEqual(['Cliente Gama cadastrado.']);
    expect(toastTones()).toEqual(['success']);
    expect(fixture.nativeElement.querySelector('[role="status"], .alert-banner--success')).toBeNull();
  });

  it('avisa a atualização e a exclusão', async () => {
    const { fixture, component } = await mount();
    component.openEditModal(client(1, 'Alfa'));
    component.form.patchValue({ legalName: 'Alfa Ltda' });
    component.saveClient(); fixture.detectChanges();
    component.openDeleteModal(client(1, 'Alfa Ltda'));
    component.confirmDeleteClient(); fixture.detectChanges();
    expect(toastMessages()).toEqual(['Cliente Alfa Ltda atualizado.', 'Cliente Alfa Ltda excluído.']);
    expect(fixture.nativeElement.querySelector('[role="status"], .alert-banner--success')).toBeNull();
  });

  it('mostra o aviso no popup da raiz', async () => {
    const { fixture, component } = await mount();
    const outlet = TestBed.createComponent(ToastOutletComponent);
    component.openCreateModal();
    component.form.patchValue({ legalName: 'Gama' });
    component.saveClient(); fixture.detectChanges(); outlet.detectChanges(); TestBed.tick();
    expect(outlet.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Cliente Gama cadastrado.');
  });

  it('mostra o resultado da importação recebido pela navegação como aviso passageiro', async () => {
    history.replaceState({ importSummary: '3 linha(s) importada(s). 1 inválida(s) e 0 duplicada(s) ignorada(s).' }, '');
    try {
      const { fixture } = await mount();
      expect(toastMessages()).toEqual(['3 linha(s) importada(s). 1 inválida(s) e 0 duplicada(s) ignorada(s).']);
      expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    } finally { history.replaceState(null, ''); }
  });
});
