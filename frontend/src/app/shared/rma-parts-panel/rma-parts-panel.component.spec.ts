import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { PartReservationResponse, RmaPartsResponse } from '../../core/models';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { PartService } from '../../core/services/part.service';
import { RmaRepairService } from '../../core/services/rma-repair.service';
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

  async function setUp(role: LegacyProfileCode, status: 'IN_REPAIR' | 'COMPLETED' = 'IN_REPAIR'): Promise<void> {
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
        { provide: RmaRepairService, useValue: { listExternalComponents: vi.fn(() => of([])), addExternalComponent: vi.fn(() => of({ id: 8 })) } },
        providePermissions(profilePermissions(role))
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
    expect(text).toMatch(/Ativas\s*1/);
    expect(text).toMatch(/Consumidas\s*1/);
    expect(text).toMatch(/Pendentes\s*1/);
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

    const cancel = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent?.trim() === 'Cancelar reserva') as HTMLButtonElement;
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
    expect(text).toContain('Cancelar reserva');
  });
  it('opens inline consumption and requires a reason before posting its batch', async () => {
    await setUp('TECHNICIAN');
    const consume = [...fixture.nativeElement.querySelectorAll('button')].find((button: any) => button.textContent.trim() === 'Consumir') as HTMLButtonElement;
    consume.click();
    fixture.detectChanges();
    expect(partService['updateReservation']).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[formControlName="replacementReason"]')).not.toBeNull();
    const component = fixture.componentInstance as any;
    component.confirmConsumption();
    expect(partService['updateReservation']).not.toHaveBeenCalled();
    component.consumptionForm.setValue({ replacementReason: '  Capacitor em curto  ', componentBatch: ' L24 ' });
    component.confirmConsumption();
    expect(partService['updateReservation']).toHaveBeenCalledWith(7, 1, 'consume', { replacementReason: 'Capacitor em curto', componentBatch: 'L24' });
  });

  it('shows a missing reason for historic consumption', async () => {
    await setUp('VIEWER');
    expect(fixture.nativeElement.textContent).toContain('Motivo não registrado');
  });

  it('adds an external component inline with trimmed text and a default unit', async () => {
    await setUp('TECHNICIAN');
    const component = fixture.componentInstance as any;
    const service = TestBed.inject(RmaRepairService);
    component.externalForm.setValue({ code: ' ', description: ' Conector ', quantity: 1.125, unit: 'un', componentBatch: ' L1 ', replacementReason: ' Oxidação ' });
    component.saveExternal();
    expect(service.addExternalComponent).toHaveBeenCalledWith(7, { code: null, description: 'Conector', quantity: 1.125, unit: 'un', componentBatch: 'L1', replacementReason: 'Oxidação' });
  });

  it('cancels inline consumption without writing and lists external and stock components together', async () => {
    await setUp('TECHNICIAN');
    const component = fixture.componentInstance as any;
    const service = TestBed.inject(RmaRepairService);
    vi.mocked(service.listExternalComponents).mockReturnValue(of([{ id: 9, code: 'EXT', description: 'Conector externo', quantity: 1.125, unit: 'un', replacementReason: 'Oxidação', componentBatch: 'B1', appliedAt: '2026-11-12T12:00:00Z', appliedBy: 'ana' }]));
    component.loadExternal(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Conector externo');
    expect(fixture.nativeElement.textContent).toContain('Fora do estoque');
    expect(fixture.nativeElement.textContent).toContain('Motivo não registrado');
    component.startConsumption(reservation(1, 'ACTIVE')); fixture.detectChanges();
    const buttons = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('.repair-actions button'));
    expect(buttons.map(b => b.textContent?.trim())).toEqual(['Cancelar', 'Confirmar']);
    buttons[0].click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[formControlName="replacementReason"]')).toBeNull();
    expect(partService['updateReservation']).not.toHaveBeenCalled();
  });

  it('blocks external writes for a viewer and after closure and rejects whitespace and excess precision', async () => {
    await setUp('TECHNICIAN');
    const component = fixture.componentInstance as any;
    const service = TestBed.inject(RmaRepairService);
    component.externalForm.setValue({ code: '', description: ' ', quantity: 1, unit: 'un', componentBatch: '', replacementReason: 'Falha' });
    component.saveExternal(); expect(service.addExternalComponent).not.toHaveBeenCalled();
    component.externalForm.patchValue({ description: 'Conector', quantity: 1.0001 });
    component.saveExternal(); expect(service.addExternalComponent).not.toHaveBeenCalled();
    component.externalForm.patchValue({ quantity: 1 });
    fixture.componentRef.setInput('rmaStatus', 'COMPLETED'); fixture.detectChanges();
    component.saveExternal(); expect(service.addExternalComponent).not.toHaveBeenCalled();
  });

  it('ignores an older external-component response after a newer reload', async () => {
    await setUp('TECHNICIAN');
    const component = fixture.componentInstance as any;
    const service = TestBed.inject(RmaRepairService);
    const stale = new Subject<any[]>(); const fresh = new Subject<any[]>();
    vi.mocked(service.listExternalComponents).mockReturnValueOnce(stale).mockReturnValueOnce(fresh);
    component.loadExternal(); component.loadExternal();
    fresh.next([{ id: 9, code: 'EXT', description: 'Componente novo', quantity: 1, unit: 'un', replacementReason: 'Falha' }]);
    stale.next([]); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Componente novo');
  });

});
