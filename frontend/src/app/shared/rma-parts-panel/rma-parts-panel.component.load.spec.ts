import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PartReservationResponse, PartResponse, RmaPartsResponse, RmaStatus } from '../../core/models';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { PartService } from '../../core/services/part.service';
import { RmaPartsPanelComponent } from './rma-parts-panel.component';

const reservation = (id: number, status: PartReservationResponse['status'], partName = 'Capacitor', rmaId = 7): PartReservationResponse => ({
  id, rmaId, rmaCode: `OS-${rmaId}`, partId: 4, partCode: 'PCA-1', partName, unit: 'un',
  location: 'A1', quantity: 2, status, partAvailable: 3, unitCost: 10, totalCost: 20, note: null, createdBy: 'tech',
  createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
});

const rmaParts = (reservations: PartReservationResponse[], rmaId = 7): RmaPartsResponse => ({
  rmaId, rmaCode: `OS-${rmaId}`, reservations, movements: [],
  reservedCost: reservations.length ? 20 : 0, consumedCost: 0, pendingCount: 0
});

const PART: PartResponse = {
  id: 4, code: 'PCA-1', name: 'Capacitor', unit: 'un', location: 'A1', minimumStock: 1, unitCost: 10,
  onHand: 5, reserved: 2, available: 3, belowMinimum: false, active: true,
  createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
};

type Harness = {
  reserveForm: { setValue(value: unknown): void };
  reserve(): void;
  runAction(reservation: PartReservationResponse, action: 'consume' | 'allocate' | 'cancel'): void;
};

describe('RmaPartsPanelComponent loading', () => {
  let fixture: ComponentFixture<RmaPartsPanelComponent>;
  let service: { getRmaParts: ReturnType<typeof vi.fn>; listOptions: ReturnType<typeof vi.fn>; reserve: ReturnType<typeof vi.fn>; updateReservation: ReturnType<typeof vi.fn> };
  const component = () => fixture.componentInstance as unknown as Harness;
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const text = () => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();
  const button = (label: string) => Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((item) => item.textContent?.trim() === label);

  async function setup(sources: { role?: LegacyProfileCode; status?: RmaStatus; parts?: Observable<RmaPartsResponse>; catalog?: Observable<PartResponse[]> } = {}) {
    service = {
      getRmaParts: vi.fn(() => sources.parts ?? of(rmaParts([reservation(1, 'ACTIVE')]))),
      listOptions: vi.fn(() => sources.catalog ?? of([PART])),
      reserve: vi.fn(() => of(reservation(9, 'ACTIVE'))),
      updateReservation: vi.fn(() => of(reservation(1, 'CONSUMED')))
    };
    await TestBed.configureTestingModule({
      imports: [RmaPartsPanelComponent],
      providers: [
        { provide: PartService, useValue: service },
        { provide: RmaRepairService, useValue: { listExternalComponents: () => of([]) } },
        providePermissions(profilePermissions(sources.role ?? 'TECHNICIAN'))
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(RmaPartsPanelComponent);
    fixture.componentRef.setInput('rmaId', 7);
    fixture.componentRef.setInput('rmaStatus', sources.status ?? 'IN_REPAIR');
    render();
    fixture.nativeElement.querySelector('#reserve-trigger')?.click();
    render();
  }

  it('preserves the loading-options select placeholder without a loading status', async () => {
    await setup({ catalog: new Subject<PartResponse[]>() });
    const select = fixture.nativeElement.querySelector('app-custom-select');
    expect(select?.textContent).toContain('Carregando opções...');
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    expect(text()).not.toContain('Nenhuma peça ativa disponível');
  });

  const expectFailureOnly = () => {
    expect(text()).toContain('Não foi possível carregar as peças da OS.');
    expect(text()).toContain('Tentar novamente');
    expect(text()).not.toContain('Nenhuma peça reservada');
    expect(text()).not.toContain('Capacitor');
    expect(text()).not.toContain('R$');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  };

  // Vermelho: a falha inicial aparece junto de "Nenhuma peça reservada" e sem nova tentativa.
  it('shows failed OS parts without an empty reservation message', async () => {
    await setup({ parts: throwError(() => new Error()) });
    expectFailureOnly();
  });

  // Vermelho: depois de uma leitura vazia, a recarga com erro mantém "Nenhuma peça reservada".
  it('replaces an empty result with the failure after reserving', async () => {
    await setup({ parts: of(rmaParts([])) });
    expect(text()).toContain('Nenhuma peça reservada');
    service.getRmaParts.mockReturnValue(throwError(() => new Error()));
    component().reserveForm.setValue({ partId: 4, quantity: 1, note: '' });
    component().reserve(); render();
    expectFailureOnly();
  });

  // Vermelho: depois de reservas com custo, a recarga com erro mantém reserva, custo e ações antigos.
  it('replaces loaded reservations and costs with the failure after an action', async () => {
    await setup();
    expect(text()).toContain('R$ 20,00');
    service.getRmaParts.mockReturnValue(throwError(() => new Error()));
    button('Aplicar')!.click(); render();
    (fixture.componentInstance as any).consumptionForm.setValue({ replacementReason: 'Falha', componentBatch: '' });
    button('Confirmar')!.click(); render();
    expectFailureOnly();
    expect(button('Aplicar')).toBeUndefined();
  });

  // Vermelho: não há botão de nova tentativa para a leitura principal.
  it('retries parts without clearing the failure while pending', async () => {
    await setup({ parts: throwError(() => new Error()) });
    const retry$ = new Subject<RmaPartsResponse>();
    service.getRmaParts.mockReturnValue(retry$);
    expect(button('Tentar novamente')).toBeDefined();
    button('Tentar novamente')!.click(); render();
    expect(button('Tentar novamente')?.disabled).toBe(true);
    expect(text()).toContain('Não foi possível carregar as peças da OS.');
    expect(text()).not.toContain('R$ 20,00');
    retry$.next(rmaParts([reservation(1, 'ACTIVE')])); retry$.complete(); render();
    expect(text()).toContain('R$ 20,00');
    expect(text()).toContain('Capacitor');
    expect(text()).not.toContain('Não foi possível carregar as peças da OS.');
    expect(service.getRmaParts).toHaveBeenLastCalledWith(7);
  });

  it('hides previous reservations and costs while reloading after an action', async () => {
    await setup();
    expect(text()).toContain('R$ 20,00');
    const reload$ = new Subject<RmaPartsResponse>();
    service.getRmaParts.mockReturnValue(reload$);
    button('Aplicar')!.click(); render();
    (fixture.componentInstance as any).consumptionForm.setValue({ replacementReason: 'Falha', componentBatch: '' });
    button('Confirmar')!.click(); render();
    expectPending(fixture.nativeElement);
    expect(text()).not.toContain('R$ 20,00');
    expect(button('Aplicar')).toBeUndefined();
    reload$.next(rmaParts([reservation(1, 'ACTIVE')])); reload$.complete(); render();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
    expect(text()).toContain('R$ 20,00');
  });

  it('keeps the catalog retry label and failure while the retry is pending', async () => {
    await setup({ catalog: throwError(() => new Error()) });
    const retry$ = new Subject<PartResponse[]>();
    service.listOptions.mockReturnValue(retry$);
    button('Tentar novamente')!.click(); render();
    const retry = button('Tentar novamente');
    expect(retry?.disabled).toBe(true);
    expect(text()).toContain('Não foi possível carregar as opções de peças.');
    expect(fixture.nativeElement.querySelector('.parts-load-error [aria-busy="true"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    retry$.next([PART]); retry$.complete(); render();
    expect(text()).not.toContain('Não foi possível carregar as opções de peças.');
    expect(button('Reservar')!.disabled).toBe(false);
  });

  // Vermelho: a falha do RMA 8 não oferece nova tentativa com o RMA atual.
  it('retries the current OS after a failing context change', async () => {
    await setup();
    service.getRmaParts.mockReturnValue(throwError(() => new Error()));
    fixture.componentRef.setInput('rmaId', 8); render();
    expectFailureOnly();
    service.getRmaParts.mockReturnValue(of(rmaParts([reservation(5, 'ACTIVE', 'Peça de B', 8)], 8)));
    button('Tentar novamente')!.click(); render();
    expect(service.getRmaParts).toHaveBeenLastCalledWith(8);
    expect(text()).toContain('Peça de B');
  });

  // Vermelho: o erro do catálogo vira lista vazia silenciosa e Reservar continua habilitado.
  it('distinguishes catalog failure from an empty active catalog', async () => {
    await setup({ catalog: throwError(() => new Error()) });
    expect(text()).toContain('Não foi possível carregar as opções de peças.');
    expect(text()).toContain('Tentar novamente');
    expect(text()).toContain('Capacitor');
    expect(text()).not.toContain('Não foi possível carregar as peças da OS.');
    expect(text()).not.toContain('Nenhuma peça ativa disponível');
    expect(button('Reservar')!.disabled).toBe(true);

    service.listOptions.mockReturnValue(of([PART]));
    button('Tentar novamente')!.click(); render();
    expect(text()).not.toContain('Não foi possível carregar as opções de peças.');
    expect(button('Reservar')!.disabled).toBe(false);
    expect(service.getRmaParts).toHaveBeenCalledTimes(1);
  });

  // Vermelho: um catálogo sem peças ativas não é identificado.
  it('explains an empty active catalog without filtering parts without stock', async () => {
    await setup({ catalog: of([{ ...PART, active: false }]) });
    expect(text()).toContain('Nenhuma peça ativa disponível');
    expect(text()).not.toContain('Não foi possível carregar as opções de peças.');
  });

  // Vermelho: a resposta do RMA anterior ainda substitui o painel do RMA atual.
  it('keeps only the latest OS after a context change', async () => {
    const first = new Subject<RmaPartsResponse>();
    const second = new Subject<RmaPartsResponse>();
    await setup({ parts: first });
    service.getRmaParts.mockReturnValue(second);
    fixture.componentRef.setInput('rmaId', 8); render();
    second.next(rmaParts([reservation(5, 'ACTIVE', 'Peça de B', 8)], 8)); second.complete(); render();
    first.next(rmaParts([reservation(1, 'ACTIVE', 'Peça de A')])); first.complete(); render();
    expect(text()).toContain('Peça de B');
    expect(text()).not.toContain('Peça de A');
    expect(first.observed).toBe(false);
  });

  // Vermelho: a reserva concluída depois da troca recarrega e anuncia sucesso no RMA atual.
  it('ignores a write result after switching OS', async () => {
    await setup();
    const write$ = new Subject<PartReservationResponse>();
    service.reserve.mockReturnValue(write$);
    component().reserveForm.setValue({ partId: 4, quantity: 1, note: '' });
    component().reserve(); render();
    service.getRmaParts.mockReturnValue(of(rmaParts([reservation(5, 'ACTIVE', 'Peça de B', 8)], 8)));
    fixture.componentRef.setInput('rmaId', 8); render();
    write$.next(reservation(9, 'ACTIVE')); write$.complete(); render();
    expect(service.getRmaParts.mock.calls.map(([id]) => id)).toEqual([7, 8]);
    expect(text()).not.toContain('reservada para a OS');
    expect(text()).toContain('Peça de B');
  });

  it('shows loading without zeros or costs on the first load', async () => {
    await setup({ parts: new Subject() });
    expectPending(fixture.nativeElement);
    expect(text()).not.toContain('R$');
    expect(text()).not.toContain('Nenhuma peça reservada');
  });

  it.each([
    ['VIEWER', 'IN_REPAIR'], ['SERVICE_DESK', 'IN_REPAIR'], ['ADMIN', 'COMPLETED'], ['TECHNICIAN', 'RETURNED']
  ] as Array<[LegacyProfileCode, RmaStatus]>)('does not request the catalog for %s on %s', async (role, status) => {
    await setup({ role, status });
    expect(service.listOptions).not.toHaveBeenCalled();
    expect(text()).toContain('Capacitor');
  });

  it('keeps a valid reading when a reservation write fails', async () => {
    await setup();
    service.updateReservation.mockReturnValue(throwError(() => ({ error: { message: 'Saldo insuficiente.' } })));
    button('Aplicar')!.click(); render();
    (fixture.componentInstance as any).consumptionForm.setValue({ replacementReason: 'Falha', componentBatch: '' });
    button('Confirmar')!.click(); render();
    expect(text()).toContain('Saldo insuficiente.');
    expect(text()).toContain('Capacitor');
    expect(text()).not.toContain('Não foi possível carregar as peças da OS.');
  });

  it('reloads parts and catalog after reserving and after each action', async () => {
    await setup();
    expect(service.listOptions).toHaveBeenCalledTimes(1);
    component().reserveForm.setValue({ partId: 4, quantity: 1, note: '' });
    component().reserve(); render();
    expect(service.getRmaParts).toHaveBeenCalledTimes(2);
    expect(service.listOptions).toHaveBeenCalledTimes(2);
    button('Aplicar')!.click(); render();
    (fixture.componentInstance as any).consumptionForm.setValue({ replacementReason: 'Falha', componentBatch: '' });
    button('Confirmar')!.click(); render();
    expect(service.getRmaParts).toHaveBeenCalledTimes(3);
    expect(service.listOptions).toHaveBeenCalledTimes(3);
  });
});

function expectPending(root: HTMLElement): void {
  const busy = root.querySelector('[aria-busy="true"]');
  expect(busy?.textContent?.trim()).toBe('');
  expect(busy?.children.length).toBe(0);
  expect(busy?.hasAttribute('role')).toBe(false);
  expect(root.textContent).not.toMatch(/Carregando(?! opções)|Atualizando (estoque|notificações|preferências|regras|falhas)/);
}
