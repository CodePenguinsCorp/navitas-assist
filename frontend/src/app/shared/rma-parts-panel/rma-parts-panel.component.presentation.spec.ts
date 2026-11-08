import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { PartMovementResponse, PartReservationResponse, PartResponse, RmaPartsResponse, RmaStatus, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PartService } from '../../core/services/part.service';
import { RmaPartsPanelComponent } from './rma-parts-panel.component';

type ReservationStatus = PartReservationResponse['status'];

const reservation = (id: number, status: ReservationStatus): PartReservationResponse => ({
  id, rmaId: 7, rmaCode: 'RMA-7', partId: 4, partCode: `PCA-${id}`, partName: 'Capacitor', unit: 'un',
  location: 'A1', quantity: 2, status, partAvailable: 3, unitCost: 10, totalCost: 20, note: null, createdBy: 'tech',
  createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
});

const MOVEMENT: PartMovementResponse = {
  id: 30, partId: 4, partCode: 'PCA-1', partName: 'Capacitor', type: 'CONSUMPTION', quantity: 2,
  onHandChange: -2, reservedChange: -2, onHandAfter: 3, reservedAfter: 0, unitCost: 10, totalCost: 20, rmaId: 7, rmaCode: 'RMA-7', reservationId: 2,
  reason: 'Troca da placa', reversed: true, reversedMovementId: null, createdBy: 'tech', createdAt: '2026-10-24T13:00:00Z'
};

const rmaParts = (reservations: PartReservationResponse[]): RmaPartsResponse => ({
  rmaId: 7, rmaCode: 'RMA-7', reservations, movements: [MOVEMENT], reservedCost: 20, consumedCost: 20, pendingCount: 1
});

const part = (id: number, unit: string, available = 3): PartResponse => ({
  id, code: `P-${id}`, name: `Peça ${id}`, unit, location: null, minimumStock: 1, unitCost: 10,
  onHand: available, reserved: 0, available, belowMinimum: false, active: true,
  createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
});

type Harness = {
  reserveForm: {
    setValue(value: unknown): void;
    controls: { partId: { setValue(value: number | null): void }; quantity: { value: number }; note: { setValue(value: string): void; markAsTouched(): void } };
  };
  partOptions(): ReadonlyArray<{ value: number; label: string }>;
};

describe('RmaPartsPanelComponent presentation', () => {
  let fixture: ComponentFixture<RmaPartsPanelComponent>;
  let service: { getRmaParts: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; reserve: ReturnType<typeof vi.fn>; updateReservation: ReturnType<typeof vi.fn> };
  const root = (): HTMLElement => fixture.nativeElement;
  const component = () => fixture.componentInstance as unknown as Harness;
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
  const text = () => normalize(root().textContent);
  const buttons = (scope: ParentNode = root()) => Array.from(scope.querySelectorAll('button')).map((item) => item.textContent!.trim());
  const button = (label: string) => Array.from<HTMLButtonElement>(root().querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  const items = () => Array.from<HTMLElement>(root().querySelectorAll('.parts-item'));
  const facts = (item: HTMLElement) => new Map(Array.from(item.querySelectorAll('dl > div')).map((row) => [normalize(row.querySelector('dt')!.textContent), normalize(row.querySelector('dd')!.textContent)]));
  const field = (control: string) => root().querySelector(`[formcontrolname="${control}"]`)!.closest('.field-group') as HTMLElement;

  async function setup(sources: { role?: UserRole; status?: RmaStatus; reservations?: PartReservationResponse[]; catalog?: PartResponse[]; update?: Observable<PartReservationResponse> } = {}) {
    service = {
      getRmaParts: vi.fn(() => of(rmaParts(sources.reservations ?? [reservation(1, 'ACTIVE'), reservation(2, 'CONSUMED'), reservation(3, 'PENDING')]))),
      list: vi.fn(() => of(sources.catalog ?? [part(4, 'm'), part(5, 'un')])),
      reserve: vi.fn(() => of(reservation(9, 'ACTIVE'))),
      updateReservation: vi.fn(() => sources.update ?? of(reservation(1, 'CANCELLED')))
    };
    await TestBed.configureTestingModule({
      imports: [RmaPartsPanelComponent],
      providers: [
        { provide: PartService, useValue: service },
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(sources.role ?? 'TECHNICIAN') } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(RmaPartsPanelComponent);
    fixture.componentRef.setInput('rmaId', 7);
    fixture.componentRef.setInput('rmaStatus', sources.status ?? 'IN_REPAIR');
    render();
  }

  const submit = () => { root().querySelector('form')!.dispatchEvent(new Event('submit')); render(); };

  // Vermelho: partAvailable aparece sob "Em estoque".
  it('labels partAvailable as Disponível', async () => {
    await setup({ reservations: [reservation(1, 'ACTIVE')] });
    const reservationFacts = facts(items()[0]);
    expect(reservationFacts.get('Disponível')).toBe('3 un');
    expect(reservationFacts.get('Quantidade')).toBe('2 un');
    expect(reservationFacts.has('Em estoque')).toBe(false);
  });

  // Vermelho: o cancelamento é rotulado apenas "Cancelar".
  it('names cancellation as a reservation operation', async () => {
    await setup();
    expect(buttons()).toContain('Consumir');
    expect(buttons()).toContain('Efetivar reserva');
    expect(buttons()).not.toContain('Cancelar');
    const cancel = buttons(items()[0]).find((label) => label.startsWith('Cancelar'));
    expect(cancel).toBe('Cancelar reserva');
    (items()[0].querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(service.updateReservation).toHaveBeenCalledWith(7, 1, 'cancel');
  });

  // Vermelho: contagens usam plurais artificiais e custos não declaram escopo.
  it('states reservation count and RMA cost scope', async () => {
    await setup();
    expect(text()).toContain('Reservas ativas: 1');
    expect(text()).toContain('Consumidas: 1');
    expect(text()).toContain('Pendentes: 1');
    const costs = facts(root().querySelector<HTMLElement>('.parts-costs')!);
    expect(costs.get('Custo consumido no RMA')).toBe('R$ 20,00');
    expect(costs.get('Custo reservado no RMA')).toBe('R$ 20,00');
    expect(facts(items()[0]).get('Custo da reserva')).toBe('R$ 20,00');
    expect(text()).not.toContain('reservada(s)');
    expect(text()).not.toContain('consumida(s)');
    expect(text()).not.toContain('pendente(s)');
  });

  // Vermelho: o formulário não tem seção nomeada nem mensagens junto dos campos; só há alerta geral.
  it('groups the inline reservation form and shows existing errors by field', async () => {
    await setup();
    expect(normalize(root().querySelector('form fieldset.form-section > legend')?.textContent)).toBe('Reservar peças');
    component().reserveForm.setValue({ partId: null, quantity: 0, note: '' });
    submit();
    expect(normalize(field('partId').textContent)).toContain('Selecione a peça.');
    expect(normalize(field('quantity').textContent)).toContain('Informe uma quantidade de pelo menos 0,001.');
    expect(text()).not.toContain('Selecione a peça e informe uma quantidade válida.');
    expect(service.reserve).not.toHaveBeenCalled();

    component().reserveForm.controls.note.setValue('x'.repeat(256));
    component().reserveForm.controls.note.markAsTouched();
    render();
    expect(normalize(field('note').textContent)).toContain('Use até 255 caracteres.');
  });

  // Vermelho: o rótulo da quantidade não informa a unidade da peça escolhida.
  it('shows the selected part unit beside reservation quantity', async () => {
    await setup();
    const label = () => normalize(field('quantity').querySelector('span')!.textContent);
    expect(label()).toBe('Quantidade');
    component().reserveForm.setValue({ partId: 4, quantity: 2.5, note: '' }); render();
    expect(label()).toBe('Quantidade (m)');
    component().reserveForm.controls.partId.setValue(5); render();
    expect(label()).toBe('Quantidade (un)');
    expect(component().reserveForm.controls.quantity.value).toBe(2.5);
  });

  const STATUSES: ReservationStatus[] = ['ACTIVE', 'PENDING', 'CONSUMED', 'CANCELLED', 'REVERSED'];
  const expectedActions = (canAct: boolean, closed: boolean, status: ReservationStatus): string[] => {
    if (!canAct) return [];
    if (status === 'ACTIVE') return closed ? ['Cancelar reserva'] : ['Consumir', 'Cancelar reserva'];
    if (status === 'PENDING') return closed ? ['Cancelar reserva'] : ['Efetivar reserva', 'Cancelar reserva'];
    return [];
  };

  it.each((['ADMIN', 'TECHNICIAN', 'SERVICE_DESK', 'VIEWER'] as UserRole[]).flatMap((role) => (['IN_REPAIR', 'COMPLETED'] as RmaStatus[]).map((status) => ({ role, status }))))(
    'preserves the reservation action matrix for $role on $status', async ({ role, status }) => {
      await setup({ role, status, reservations: STATUSES.map((value, index) => reservation(index + 1, value)) });
      const canAct = role === 'ADMIN' || role === 'TECHNICIAN';
      const closed = status === 'COMPLETED';
      STATUSES.forEach((value, index) => {
        expect(buttons(items()[index])).toEqual(expectedActions(canAct, closed, value));
        expect(facts(items()[index]).get('Custo da reserva')).toBe('R$ 20,00');
      });
      expect(root().querySelector('form') !== null).toBe(canAct && !closed);
      expect(button('Reservar') !== undefined).toBe(canAct && !closed);
      expect(text()).toContain('Custo consumido no RMA');
    });

  it('keeps active parts without stock among the options', async () => {
    await setup({ catalog: [part(4, 'm', 0), { ...part(5, 'un'), active: false }] });
    expect(component().partOptions().map((option) => option.value)).toEqual([4]);
    expect(component().partOptions()[0].label).toContain('disponível: 0 m');
  });

  it('sends a valid reservation with the current payload and normalized note', async () => {
    await setup();
    component().reserveForm.setValue({ partId: 4, quantity: 1.5, note: '  Troca  ' });
    submit();
    expect(service.reserve).toHaveBeenCalledWith(7, { partId: 4, quantity: 1.5, note: 'Troca' });
  });

  it('blocks other reservation actions while one is pending', async () => {
    const pending = new Subject<PartReservationResponse>();
    await setup({ update: pending });
    button('Consumir')!.click(); render();
    for (const label of ['Consumir', 'Efetivar reserva', 'Cancelar reserva']) expect(button(label)!.disabled).toBe(true);
    (items()[0].querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(service.updateReservation).toHaveBeenCalledTimes(1);
  });

  it('keeps the collapsible movement history with reversal and reason', async () => {
    await setup();
    const history = root().querySelector('details.parts-history')!;
    expect(normalize(history.querySelector('summary')!.textContent)).toBe('Histórico de movimentos de peças');
    expect(normalize(history.textContent)).toContain('estornado');
    expect(normalize(history.textContent)).toContain('Troca da placa');
  });
});
