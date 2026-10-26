import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PartReservationResponse, RmaPartsResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PartService } from '../../core/services/part.service';
import { RmaPartsPanelComponent } from './rma-parts-panel.component';

const reservation = (id: number, status: PartReservationResponse['status']): PartReservationResponse => ({
  id, rmaId: 7, rmaCode: 'RMA-2026-000007', partId: 4, partCode: 'PCA-1', partName: 'Capacitor', unit: 'un',
  location: 'A1', quantity: 2, status, partAvailable: 3, unitCost: 10, totalCost: 20, note: null, createdBy: 'tech',
  createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
});

const RMA_PARTS: RmaPartsResponse = {
  rmaId: 7,
  rmaCode: 'RMA-2026-000007',
  reservations: [reservation(1, 'ACTIVE'), reservation(2, 'CONSUMED'), reservation(3, 'PENDING')],
  movements: [],
  reservedCost: 20,
  consumedCost: 20,
  pendingCount: 1
};

describe('RmaPartsPanelComponent', () => {
  let fixture: ComponentFixture<RmaPartsPanelComponent>;
  let partService: Record<string, ReturnType<typeof vi.fn>>;

  async function setUp(role: UserRole, status: 'IN_REPAIR' | 'COMPLETED' = 'IN_REPAIR'): Promise<void> {
    partService = {
      getRmaParts: vi.fn(() => of(RMA_PARTS)),
      list: vi.fn(() => of([])),
      reserve: vi.fn(() => of(reservation(4, 'PENDING'))),
      updateReservation: vi.fn(() => of(reservation(1, 'CANCELLED')))
    };
    await TestBed.configureTestingModule({
      imports: [RmaPartsPanelComponent],
      providers: [
        { provide: PartService, useValue: partService },
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(role) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(RmaPartsPanelComponent);
    fixture.componentRef.setInput('rmaId', 7);
    fixture.componentRef.setInput('rmaStatus', status);
    fixture.detectChanges();
  }

  it('shows reserved, consumed and pending parts with consumed cost', async () => {
    await setUp('VIEWER');
    const text: string = fixture.nativeElement.textContent;

    expect(partService['getRmaParts']).toHaveBeenCalledWith(7);
    expect(text).toContain('1 reservada(s)');
    expect(text).toContain('1 consumida(s)');
    expect(text).toContain('1 pendente(s)');
    expect(text).toContain('Custo consumido');
    expect(text).not.toContain('Consumir');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(partService['list']).not.toHaveBeenCalled();
  });

  it('lets technicians reserve and act on reservations', async () => {
    await setUp('TECHNICIAN');
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Consumir');
    expect(text).toContain('Efetivar reserva');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();

    const cancel = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent?.trim() === 'Cancelar') as HTMLButtonElement;
    cancel.click();
    expect(partService['updateReservation']).toHaveBeenCalledWith(7, 1, 'cancel');
  });

  it('reports pending reservations when stock is insufficient', async () => {
    await setUp('TECHNICIAN');
    const component = fixture.componentInstance as unknown as { reserveForm: { setValue(value: unknown): void }; reserve(): void; successMessage(): string };
    component.reserveForm.setValue({ partId: 4, quantity: 5, note: '  ' });
    component.reserve();

    expect(partService['reserve']).toHaveBeenCalledWith(7, { partId: 4, quantity: 5, note: null });
    expect(component.successMessage()).toContain('pendente de reposição');
  });

  it('only allows cancelling reservations of closed RMAs', async () => {
    await setUp('ADMIN', 'COMPLETED');
    const text: string = fixture.nativeElement.textContent;

    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(text).not.toContain('Consumir');
    expect(text).not.toContain('Efetivar reserva');
    expect(text).toContain('Cancelar');
  });
});
