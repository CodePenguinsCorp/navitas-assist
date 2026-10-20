import { Signal, signal } from '@angular/core';
import { FormArray, FormGroup } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UserSession } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { RmasComponent } from './rmas.component';

describe('RmasComponent form', () => {
  let component: RmaFormHarness;

  beforeEach(async () => {
    const currentUser = signal<UserSession | null>({
      username: 'tester',
      name: 'Tester',
      role: 'ADMIN',
    });
    await TestBed.configureTestingModule({
      imports: [RmasComponent],
      providers: [
        {
          provide: AuthService,
          useValue: { currentUser: currentUser.asReadonly(), hasAnyRole: () => true },
        },
        {
          provide: CatalogService,
          useValue: { listClients: () => of([]), listProducts: () => of([]) },
        },
        { provide: RmaService, useValue: { list: () => of([]) } },
      ],
    }).compileComponents();
    component = TestBed.createComponent(RmasComponent)
      .componentInstance as unknown as RmaFormHarness;
  });

  it('requires a product and at least one batch or serial number per item', () => {
    const item = component.createItems.at(0);
    expect(item.invalid).toBe(true);
    expect(item.hasError('identificationRequired')).toBe(true);

    item.patchValue({ productId: 2, serialNumber: 'SER-2' });
    expect(item.valid).toBe(true);

    component.addCreateItem();
    expect(component.createItems.length).toBe(2);
    expect(component.createForm.invalid).toBe(true);
  });

  it('reports future manufacturing and inconsistent purchase and entry dates', () => {
    const item = component.createItems.at(0);
    item.patchValue({ productId: 2, serialNumber: 'SER-2', manufacturedAt: '9999-01-01' });
    component.createForm.patchValue({ purchaseDate: '2026-06-01', entryDate: '2026-05-01' });

    expect(component.dateErrors().manufacturedAt[0]).toContain('posterior a hoje');
    expect(component.dateErrors().purchaseDate).toContain('anterior');
    expect(component.dateErrors().entryDate).toContain('anterior');
  });

  it('clears a purchase date when it is marked as unknown', () => {
    component.createForm.patchValue({ purchaseDate: '2026-01-10', purchaseDateUnknown: true });
    expect(component.createForm.get('purchaseDate')?.value).toBe('');
  });
});

interface RmaFormHarness {
  createForm: FormGroup;
  createItems: FormArray<FormGroup>;
  dateErrors: Signal<{ manufacturedAt: string[]; purchaseDate: string; entryDate: string }>;
  addCreateItem(): void;
}
