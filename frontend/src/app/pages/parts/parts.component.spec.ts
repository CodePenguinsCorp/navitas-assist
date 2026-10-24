import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PartMovementResponse, PartResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PartService } from '../../core/services/part.service';
import { PartsComponent } from './parts.component';

const PART: PartResponse = {
  id: 4, code: 'PCA-1', name: 'Capacitor', unit: 'un', location: 'A1', minimumStock: 5, unitCost: 10,
  onHand: 4, reserved: 1, available: 3, belowMinimum: true, active: true,
  createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
};

const CONSUMPTION: PartMovementResponse = {
  id: 9, partId: 4, partCode: 'PCA-1', partName: 'Capacitor', type: 'CONSUMPTION', quantity: 1, onHandChange: -1,
  reservedChange: -1, onHandAfter: 4, reservedAfter: 1, unitCost: 10, totalCost: 10, rmaId: 7, rmaCode: 'RMA-7',
  reservationId: 2, reversedMovementId: null, reversed: false, reason: null, createdBy: 'tech', createdAt: '2026-10-24T12:00:00Z'
};

interface PartsHarness {
  canManage(): boolean;
  belowMinimumCount(): number;
  modalErrorMessage(): string;
  movementForm: { setValue(value: unknown): void };
  openMovementModal(part: PartResponse): void;
  saveMovement(): void;
  openHistory(part: PartResponse): void;
  startReversal(movement: PartMovementResponse): void;
  reversalReason: { setValue(value: string): void };
  confirmReversal(movement: PartMovementResponse): void;
}

describe('PartsComponent', () => {
  let fixture: ComponentFixture<PartsComponent>;
  let component: PartsHarness;
  let partService: Record<string, ReturnType<typeof vi.fn>>;

  async function setUp(role: UserRole): Promise<void> {
    partService = {
      list: vi.fn(() => of([PART])),
      listReplenishment: vi.fn(() => of([])),
      listPending: vi.fn(() => of([])),
      registerMovement: vi.fn(() => of({ ...CONSUMPTION, type: 'ADJUSTMENT' })),
      listMovements: vi.fn(() => of([CONSUMPTION])),
      reverseMovement: vi.fn(() => of({ ...CONSUMPTION, id: 10, type: 'REVERSAL' }))
    };
    await TestBed.configureTestingModule({
      imports: [PartsComponent],
      providers: [
        { provide: PartService, useValue: partService },
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(role) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(PartsComponent);
    component = fixture.componentInstance as unknown as PartsHarness;
    fixture.detectChanges();
  }

  it('shows stock balances read-only for viewers', async () => {
    await setUp('VIEWER');
    const text: string = fixture.nativeElement.textContent;

    expect(component.canManage()).toBe(false);
    expect(component.belowMinimumCount()).toBe(1);
    expect(text).toContain('Capacitor');
    expect(text).toContain('Repor');
    expect(text).toContain('Histórico');
    expect(text).not.toContain('Movimentar');
    expect(text).not.toContain('Nova peça');
  });

  it('requires a reason before sending a stock adjustment', async () => {
    await setUp('SERVICE_DESK');
    component.openMovementModal(PART);
    component.movementForm.setValue({ type: 'ADJUSTMENT', quantity: -1, reason: '' });
    component.saveMovement();

    expect(component.modalErrorMessage()).toBe('Informe o motivo do ajuste.');
    expect(partService['registerMovement']).not.toHaveBeenCalled();

    component.movementForm.setValue({ type: 'ADJUSTMENT', quantity: -1, reason: 'Inventário' });
    component.saveMovement();
    expect(partService['registerMovement']).toHaveBeenCalledWith(4, { type: 'ADJUSTMENT', quantity: -1, reason: 'Inventário' });
  });

  it('reverses a movement with a mandatory reason', async () => {
    await setUp('ADMIN');
    component.openHistory(PART);
    component.startReversal(CONSUMPTION);
    component.confirmReversal(CONSUMPTION);
    expect(component.modalErrorMessage()).toBe('Informe o motivo do estorno.');

    component.reversalReason.setValue('Peça não utilizada');
    component.confirmReversal(CONSUMPTION);
    expect(partService['reverseMovement']).toHaveBeenCalledWith(9, 'Peça não utilizada');
  });
});
