import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { providePermissions } from '../../testing/permission-fixtures';
import { buildRma, buildRmaPage } from '../../testing/rma-fixtures';
import { RmasComponent } from './rmas.component';

// Validation, payload, errors and focus are covered by the shared editor specs.
describe('Diagnóstico no detalhe da lista', () => {
  let fixture: ComponentFixture<RmasComponent>;
  const rma = buildRma();
  const page = () => fixture.nativeElement as HTMLElement;
  const render = () => { fixture.detectChanges(); TestBed.tick(); };
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RmasComponent],
      providers: [provideRouter([]), providePermissions(['rma.ver', 'rma.diagnosticar']),
        { provide: AuthService, useValue: { currentUser: () => ({ name: 'Ana' }) } },
        { provide: CatalogService, useValue: { listClientOptions: () => of([]), listProductOptions: () => of([]) } },
        { provide: RmaService, useValue: { list: () => of(buildRmaPage([rma])), getSummary: () => of({ total: 1, ongoing: 1, highPriority: 0 }) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(RmasComponent); render();
  });
  it('abre o editor dentro do cartão e mantém o detalhe ao cancelar', () => {
    page().querySelector<HTMLElement>('.rma-table-row')!.click(); render();
    expect(page().querySelector('.rma-details__header-actions .button-primary')).toBeNull();
    [...page().querySelectorAll<HTMLButtonElement>('.tab')].find(b => b.textContent?.trim() === 'Diagnóstico')!.click(); render();
    const editor = page().querySelector('app-rma-diagnosis')!;
    [...editor.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === 'Registrar diagnóstico')!.click(); render();
    expect(editor.querySelector('form')).not.toBeNull();
    expect(page().querySelectorAll('[role="dialog"]')).toHaveLength(1);
    [...editor.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === 'Cancelar')!.click(); render();
    expect(editor.querySelector('form')).toBeNull();
    expect(page().querySelector('.rma-details')).not.toBeNull();
  });
});
