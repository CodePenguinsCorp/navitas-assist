import { routes } from '../../app.routes';
import { permissionGuard } from '../../guards/permission.guard';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogService } from '../../core/services/catalog.service';
import { providePermissions } from '../../testing/permission-fixtures';
import { ClientsComponent } from '../clients/clients.component';
import { ProductsComponent } from '../products/products.component';

describe('Acesso à importação CSV', () => {
  it('protege rotas lazy com tipo fixo e permissao de importar', () => {
    const children = routes.find(route => route.path === '')!.children!;
    for (const [path, kind] of [['clientes/importar', 'clients'], ['produtos/importar', 'products']]) {
      const route = children.find(route => route.path === path)!;
      expect(route.loadComponent).toBeTypeOf('function');
      expect(route.canActivate).toEqual([permissionGuard]);
      expect(route.data).toEqual({ permissions: ['cadastros.importar'], catalogKind: kind });
    }
  });
  for (const [component, collection, summary, route] of [
    [ClientsComponent, 'listClients', 'getClientSummary', '/clientes/importar'],
    [ProductsComponent, 'listProducts', 'getProductSummary', '/produtos/importar']
  ] as const) {
    it(`oculta importar em ${route} sem permissao`, () => {
      TestBed.configureTestingModule({ imports: [component], providers: [provideRouter([]), providePermissions(['cadastros.ver', 'cadastros.editar']), { provide: CatalogService, useValue: {
        [collection]: () => of({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
        [summary]: () => of({ total: 0, categories: [] })
      } }] });
      const fixture = TestBed.createComponent<any>(component);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(`a[href="${route}"]`)).toBeNull();
      expect(fixture.nativeElement.querySelector('.page-heading button')).not.toBeNull();
    });
    it(`exibe somente importar para ${route} sem conceder edição`, () => {
      TestBed.configureTestingModule({ imports: [component], providers: [provideRouter([]), providePermissions(['cadastros.importar']), { provide: CatalogService, useValue: {
        [collection]: () => of({ content: [{ id: 1, legalName: 'Cliente', name: 'Produto', sku: 'A', updatedAt: '', createdAt: '' }], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
        [summary]: () => of({ total: 1, categories: [] })
      } }] });
      const fixture = TestBed.createComponent<any>(component);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(`a[href="${route}"]`)?.textContent).toContain('Importar CSV');
      expect(fixture.nativeElement.querySelector('.page-heading button')).toBeNull();
      expect(fixture.nativeElement.querySelector('[appRowAction]')).toBeNull();
    });
  }
});
