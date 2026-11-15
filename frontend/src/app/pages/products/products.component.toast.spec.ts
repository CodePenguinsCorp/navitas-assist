import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ProductRequest, ProductResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ToastOutletComponent } from '../../shared/toast-outlet/toast-outlet.component';
import { providePermissions } from '../../testing/permission-fixtures';
import { toastMessages, toastTones } from '../../testing/toast';
import { ProductsComponent } from './products.component';

const product = (id: number, name: string): ProductResponse => ({
  id, sku: `SKU-${id}`, name, category: 'Controle', hardwareVersion: null, firmwareVersion: null,
  defaultWarrantyMonths: 12, technicalNotes: null, updatedAt: '2026-10-20T12:00:00Z'
});

interface Harness {
  form: { patchValue(value: unknown): void };
  openCreateModal(): void;
  openEditModal(product: ProductResponse): void;
  saveProduct(): void;
  openDeleteModal(product: ProductResponse): void;
  confirmDeleteProduct(): void;
}

describe('ProductsComponent avisos de sucesso', () => {
  async function mount() {
    await TestBed.configureTestingModule({
      imports: [ProductsComponent],
      providers: [provideRouter([]), providePermissions(['cadastros.ver', 'cadastros.editar']), { provide: CatalogService, useValue: {
        listProducts: () => of({ content: [product(1, 'Alfa')], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
        getProductSummary: () => of({ total: 1, categories: [], withFirmware: 0 }),
        deleteProduct: () => of(undefined),
        createProduct: (request: ProductRequest) => of(product(9, request.name)),
        updateProduct: (id: number, request: ProductRequest) => of(product(id, request.name))
      } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(ProductsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as unknown as Harness };
  }

  it('avisa o cadastro em aviso flutuante e não deixa aviso fixo na página', async () => {
    const { fixture, component } = await mount();
    component.openCreateModal();
    component.form.patchValue({ sku: 'GM-1', name: 'Gama' });
    component.saveProduct(); fixture.detectChanges();
    expect(toastMessages()).toEqual(['Produto Gama cadastrado.']);
    expect(toastTones()).toEqual(['success']);
    expect(fixture.nativeElement.querySelector('[role="status"], .alert-banner--success')).toBeNull();
  });

  it('avisa a atualização e a exclusão', async () => {
    const { fixture, component } = await mount();
    component.openEditModal(product(1, 'Alfa'));
    component.form.patchValue({ name: 'Alfa 2' });
    component.saveProduct(); fixture.detectChanges();
    component.openDeleteModal(product(1, 'Alfa 2'));
    component.confirmDeleteProduct(); fixture.detectChanges();
    expect(toastMessages()).toEqual(['Produto Alfa 2 atualizado.', 'Produto Alfa 2 excluído.']);
    expect(fixture.nativeElement.querySelector('[role="status"], .alert-banner--success')).toBeNull();
  });

  it('mostra o aviso no popup da raiz', async () => {
    const { fixture, component } = await mount();
    const outlet = TestBed.createComponent(ToastOutletComponent);
    component.openCreateModal();
    component.form.patchValue({ sku: 'GM-1', name: 'Gama' });
    component.saveProduct(); fixture.detectChanges(); outlet.detectChanges(); TestBed.tick();
    expect(outlet.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Produto Gama cadastrado.');
  });

  it('mostra o resultado da importação recebido pela navegação como aviso passageiro', async () => {
    history.replaceState({ importSummary: '5 linha(s) importada(s). 0 inválida(s) e 2 duplicada(s) ignorada(s).' }, '');
    try {
      const { fixture } = await mount();
      expect(toastMessages()).toEqual(['5 linha(s) importada(s). 0 inválida(s) e 2 duplicada(s) ignorada(s).']);
      expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    } finally { history.replaceState(null, ''); }
  });
});
