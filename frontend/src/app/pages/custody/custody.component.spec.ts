import { Signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { CustodyMovementRequest, RmaCustodyResponse, StorageLocationResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CustodyService } from '../../core/services/custody.service';
import { CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';
import { CustodyComponent } from './custody.component';

const LOCATIONS: StorageLocationResponse[] = [
  { id: 1, code: 'BANC-01', name: 'Bancada 1', type: 'BENCH', parentId: null, parentName: null, description: null, active: true,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' },
  { id: 2, code: 'PRAT-01', name: 'Prateleira 1', type: 'SHELF', parentId: null, parentName: null, description: null, active: false,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' },
  { id: 3, code: 'EXP-01', name: 'Expedição', type: 'SHIPPING', parentId: null, parentName: null, description: null, active: true,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' }
];

const ENTRIES: RmaCustodyResponse[] = [
  { rmaId: 10, rmaCode: 'RMA-2026-000010', rmaStatus: 'TRIAGE', clientName: 'Cliente A', productName: 'Controlador', locationId: null,
    locationCode: null, locationName: null, locationType: null, custodianId: null, custodianName: null, since: null, flag: 'MISSING' },
  { rmaId: 11, rmaCode: 'RMA-2026-000011', rmaStatus: 'COMPLETED', clientName: 'Cliente B', productName: 'Sensor', locationId: 1,
    locationCode: 'BANC-01', locationName: 'Bancada 1', locationType: 'BENCH', custodianId: 4, custodianName: 'Técnica', since: '2026-10-20T12:00:00Z', flag: 'STALE' }
];

describe('CustodyComponent', () => {
  let fixture: ComponentFixture<CustodyComponent>;
  let component: CustodyHarness;
  let role: UserRole;
  let searches: Array<{ locationId?: number | null; flag?: string | null }>;
  let moves: Array<{ rmaId: number; payload: CustodyMovementRequest }>;

  async function setup(currentRole: UserRole): Promise<void> {
    role = currentRole;
    searches = [];
    moves = [];
    await TestBed.configureTestingModule({
      imports: [CustodyComponent],
      providers: [
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(role) } },
        { provide: CustodyService, useValue: {
          listLocations: () => of(LOCATIONS),
          listCustodians: () => of([{ id: 4, username: 'tech', fullName: 'Técnica' }]),
          search: (filters: { locationId?: number | null; flag?: string | null }) => {
            searches.push(filters);
            return of({ content: ENTRIES, page: 0, size: 20, totalElements: 45, totalPages: 3 });
          },
          summary: () => of({ tracked: 45, missing: 7, stale: 3 }),
          move: (rmaId: number, payload: CustodyMovementRequest) => {
            moves.push({ rmaId, payload });
            return of({ current: { ...ENTRIES[0], locationId: payload.toLocationId }, movements: [] });
          },
          getDetail: () => of({ current: ENTRIES[0], movements: [] })
        } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CustodyComponent);
    component = fixture.componentInstance as unknown as CustodyHarness;
    fixture.detectChanges();
  }

  it('flags missing and stale equipment and reloads by area', async () => {
    await setup('VIEWER');

    expect(component.summary()).toEqual({ tracked: 45, missing: 7, stale: 3 });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('45 registro(s)');
    expect(text).toContain('Página 1 de 3');
    expect(text).not.toContain('Movimentar');

    component.goToPage(2);
    expect(searches.at(-1)).toEqual(expect.objectContaining({ page: 2 }));
    component.updateLocationFilter(1);
    expect(searches.at(-1)).toEqual(expect.objectContaining({ locationId: 1, flag: null, page: 0 }));
  });

  it('offers only entry without location and only active destinations', async () => {
    await setup('TECHNICIAN');

    component.openMoveModal(ENTRIES[0]);
    expect(component.movementTypeOptions().map((option) => option.value)).toEqual(['ENTRY']);
    expect(component.destinationOptions().map((option) => option.value)).toEqual([1, 3]);

    component.saveMovement();
    expect(moves).toEqual([]);

    component.form.patchValue({ toLocationId: 1, reason: '  Recebido  ' });
    component.saveMovement();
    expect(moves).toEqual([{ rmaId: 10, payload: { type: 'ENTRY', toLocationId: 1, custodianId: null, reason: 'Recebido' } }]);
  });

  it('allows exit only for finished RMAs and sends no destination', async () => {
    await setup('SERVICE_DESK');

    component.openMoveModal(ENTRIES[1]);
    expect(component.movementTypeOptions().map((option) => option.value)).toEqual(['TRANSFER', 'EXIT']);
    expect(component.destinationOptions().map((option) => option.value)).toEqual([3]);

    component.form.patchValue({ type: 'EXIT', toLocationId: 3, custodianId: 4 });
    component.saveMovement();
    expect(moves[0].payload).toEqual({ type: 'EXIT', toLocationId: null, custodianId: null, reason: null });
  });
});

type CustodyHarness = {
  form: FormGroup;
  summary: Signal<{ tracked: number; missing: number; stale: number }>;
  goToPage(page: number): void;
  movementTypeOptions: Signal<ReadonlyArray<CustomSelectOption<string>>>;
  destinationOptions: Signal<ReadonlyArray<CustomSelectOption<number | null>>>;
  updateLocationFilter(value: number | null): void;
  openMoveModal(entry: RmaCustodyResponse): void;
  saveMovement(): void;
};
