import { Signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ShipmentDetailResponse, ShipmentResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmaService } from '../../core/services/rma.service';
import { ShipmentService } from '../../core/services/shipment.service';
import { ShipmentsComponent } from './shipments.component';

const SHIPMENT: ShipmentResponse = {
  id: 7, rmaId: 3, rmaCode: 'RMA-2026-000003', type: 'RETURN', status: 'DELIVERY_ATTEMPT', originName: 'Laboratório', originAddress: null,
  destinationName: 'Cliente', destinationAddress: null, addressRestricted: true, addressesPurged: false, volumes: 1, carrier: 'Correios',
  serviceName: 'Sedex', trackingCode: 'BR1', labelReference: null, cost: 18.4, deliveryAttempts: 1, closedAt: null, createdBy: 'desk',
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
};

const DETAIL: ShipmentDetailResponse = { shipment: { ...SHIPMENT, addressRestricted: false, destinationAddress: 'Rua A, 1' }, events: [] };

describe('ShipmentsComponent', () => {
  let fixture: ComponentFixture<ShipmentsComponent>;
  let component: ShipmentsHarness;
  let role: UserRole;
  let created: unknown[];
  let updated: unknown[];
  let manualEvents: unknown[];

  async function setup(currentRole: UserRole): Promise<void> {
    role = currentRole;
    created = [];
    updated = [];
    manualEvents = [];
    await TestBed.configureTestingModule({
      imports: [ShipmentsComponent],
      providers: [
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(role) } },
        { provide: RmaService, useValue: { list: () => of([{ id: 3, code: 'RMA-2026-000003', clientName: 'Cliente' }]) } },
        { provide: ShipmentService, useValue: {
          list: () => of([SHIPMENT]),
          getDetail: () => of(DETAIL),
          create: (payload: unknown) => { created.push(payload); return of(DETAIL); },
          update: (_id: number, payload: unknown) => { updated.push(payload); return of(DETAIL); },
          addManualEvent: (_id: number, payload: unknown) => { manualEvents.push(payload); return of(DETAIL); },
          sync: () => throwError(() => ({ error: { message: 'No carrier integration is configured.' } }))
        } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ShipmentsComponent);
    component = fixture.componentInstance as unknown as ShipmentsHarness;
    fixture.detectChanges();
  }

  it('shows restricted addresses and hides management actions for technicians', async () => {
    await setup('TECHNICIAN');

    expect(component.attentionCount()).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('Nova remessa');
    expect(fixture.nativeElement.textContent).not.toContain('Editar');
    expect(component.addressLabel(SHIPMENT, null)).toBe('Restrito ao seu perfil');
  });

  it('creates shipments with decimal cost as text and requires justification to edit', async () => {
    await setup('SERVICE_DESK');

    component.openCreateForm();
    component.form.patchValue({ rmaId: 3, originName: ' Cliente ', destinationName: 'Laboratório', carrier: 'Correios', cost: '125,90' });
    component.saveShipment();
    expect(created).toEqual([expect.objectContaining({ rmaId: 3, originName: 'Cliente', cost: '125.90', trackingCode: null })]);

    component.openEditForm(SHIPMENT);
    expect(component.form.controls['cost'].value).toBe('18.40');
    component.saveShipment();
    expect(updated).toEqual([]);

    component.form.patchValue({ justification: 'Frete reajustado' });
    component.saveShipment();
    expect(updated).toEqual([expect.objectContaining({ justification: 'Frete reajustado', cost: '18.40' })]);
  });

  it('keeps manual updates available when the carrier is unavailable', async () => {
    await setup('ADMIN');

    component.openDetail(SHIPMENT);
    component.syncWithCarrier();
    expect(component.modalErrorMessage()).toContain('A atualização manual continua disponível.');

    component.saveManualEvent();
    expect(manualEvents).toEqual([]);
    component.eventForm.patchValue({ status: 'DELIVERED', justification: 'Entrega confirmada por telefone' });
    component.saveManualEvent();
    expect(manualEvents).toEqual([expect.objectContaining({ status: 'DELIVERED', justification: 'Entrega confirmada por telefone' })]);
  });
});

type ShipmentsHarness = {
  form: FormGroup;
  eventForm: FormGroup;
  attentionCount: Signal<number>;
  modalErrorMessage: Signal<string>;
  addressLabel(shipment: ShipmentResponse, address: string | null): string;
  openCreateForm(): void;
  openEditForm(shipment: ShipmentResponse): void;
  saveShipment(): void;
  openDetail(shipment: ShipmentResponse): void;
  syncWithCarrier(): void;
  saveManualEvent(): void;
};
