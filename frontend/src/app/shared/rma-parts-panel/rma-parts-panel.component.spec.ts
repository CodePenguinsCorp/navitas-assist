import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { PartReservationResponse, RmaPartsResponse } from '../../core/models';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { PartService } from '../../core/services/part.service';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { RmaPartsPanelComponent } from './rma-parts-panel.component';
import { expectInlineForm } from '../../testing/inline-form';
import { toastMessages, toastTones } from '../../testing/toast';

const reservation = (id: number, status: PartReservationResponse['status']): PartReservationResponse => ({
  id, rmaId: 7, rmaCode: 'OS-2026-000007', partId: 4, partCode: 'PCA-1', partName: 'Capacitor', unit: 'un',
  location: 'A1', quantity: 2, status, partAvailable: 3, unitCost: 10, totalCost: 20, note: null, createdBy: 'tech',
  createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
});

const RMA_PARTS: RmaPartsResponse = {
  rmaId: 7,
  rmaCode: 'OS-2026-000007',
  reservations: [reservation(1, 'ACTIVE'), reservation(2, 'CONSUMED'), reservation(3, 'PENDING')],
  movements: [],
  reservedCost: 20,
  consumedCost: 20,
  pendingCount: 1
};

describe('RmaPartsPanelComponent', () => {
  let fixture: ComponentFixture<RmaPartsPanelComponent>;
  let partService: Record<string, ReturnType<typeof vi.fn>>;

  it('separa identificação, dados e ações de cada reserva sem alterar a ordem', async () => {
    await setUp('TECHNICIAN');
    const items = Array.from(fixture.nativeElement.querySelectorAll('[aria-label="Reservas de peças"] > .record-row')) as HTMLElement[];
    expect(items.map(item => item.querySelector('dl')?.getAttribute('aria-label'))).toEqual([
      'Dados da reserva de PCA-1', 'Dados da reserva de PCA-1', 'Dados da reserva de PCA-1'
    ]);
    expect(items.map(item => item.querySelector('.mini-chip')?.textContent?.trim())).toEqual(['Reservada', 'Aplicada', 'Pendente']);
    expect(items[0].querySelector('.record-row__title')?.textContent?.trim()).toBe('Capacitor');
    expect(Array.from(items[0].querySelectorAll('dt')).map(label => label.textContent)).toEqual(['Quantidade', 'Disponível', 'Custo', 'Local']);
    expect(items[0].querySelector('.record-row__main .record-row__actions')).toBeNull();
    expect(items[0].querySelector('button[aria-label="Cancelar reserva Capacitor"]')?.classList).toContain('icon-button--danger');
    expect(items[0].querySelector('dl')?.classList).toContain('record-stats');
    expect(items[0].querySelector('.record-row__meta')).toBeNull();
  });

  it('bloqueia frações contáveis na reserva e revalida ao trocar a peça', async () => {
    await setUp('TECHNICIAN');
    const c = fixture.componentInstance as any;
    c.catalog.set([{ id: 4, code: 'P1', name: 'Peça', unit: 'UN', active: true, available: 10 }, { id: 5, code: 'M1', name: 'Medida', unit: 'kg', active: true, available: 10 }]);
    c.reserveForm.patchValue({ partId: 4, quantity: 3.5 });
    c.reserve(); fixture.detectChanges();
    expect(partService['reserve']).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#reserve-quantity-error')?.textContent).toContain('Informe um número inteiro.');
    expect(fixture.nativeElement.querySelector('#reserve-form input[type="number"]')?.getAttribute('step')).toBe('1');
    c.reserveForm.controls.partId.setValue(5); fixture.detectChanges();
    expect(c.reserveForm.controls.quantity.valid).toBe(true);
    expect(fixture.nativeElement.querySelector('#reserve-form input[type="number"]')?.getAttribute('step')).toBe('any');
  });

  it('revalida componente externo quando muda a unidade e impede envio inválido', async () => {
    await setUp('TECHNICIAN');
    const c = fixture.componentInstance as any;
    c.toggleExternal();
    c.externalForm.patchValue({ description: 'Componente', quantity: 1.222, unit: 'un', replacementReason: 'Troca' });
    c.saveExternal(); fixture.detectChanges();
    expect(c.externalForm.controls.quantity.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('#external-form')?.textContent).toContain('Informe um número inteiro.');
    c.externalForm.controls.unit.setValue('m³'); fixture.detectChanges();
    expect(c.externalForm.controls.quantity.valid).toBe(true);
  });

  it('exibe legado fracionado, bloqueia aplicação e efetivação e permite cancelar', async () => {
    await setUp('TECHNICIAN');
    const c = fixture.componentInstance as any;
    const legacy = { ...reservation(1, 'ACTIVE'), quantity: 1.222 };
    c.parts.set({ ...RMA_PARTS, reservations: [legacy] }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1,222 un');
    c.runAction(legacy, 'consume'); c.runAction({ ...legacy, status: 'PENDING' }, 'allocate');
    expect(partService['updateReservation']).not.toHaveBeenCalled();
    c.runAction(legacy, 'cancel');
    expect(partService['updateReservation']).toHaveBeenCalledWith(7, 1, 'cancel');
  });

  async function setUp(role: LegacyProfileCode, status: 'IN_REPAIR' | 'COMPLETED' = 'IN_REPAIR'): Promise<void> {
    partService = {
      getRmaParts: vi.fn(() => of(RMA_PARTS)),
      listOptions: vi.fn(() => of([])),
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
    fixture.nativeElement.querySelector('#reserve-trigger')?.click();
    fixture.detectChanges();
  }

  it('shows reserved, consumed and pending parts with consumed cost', async () => {
    await setUp('VIEWER');
    const text: string = fixture.nativeElement.textContent;

    expect(partService['getRmaParts']).toHaveBeenCalledWith(7);
    expect(text).toMatch(/Ativas\s*1/);
    expect(text).toMatch(/Aplicadas\s*1/);
    expect(text).toMatch(/Pendentes\s*1/);
    expect(text).toContain('Custo aplicado');
    expect(text).not.toContain('Aplicar');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(partService['listOptions']).not.toHaveBeenCalled();
  });

  it('lets technicians reserve and act on reservations', async () => {
    await setUp('TECHNICIAN');
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Aplicar');
    expect(text).toContain('Efetivar reserva');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();

    const cancel = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent?.trim() === 'Cancelar reserva') as HTMLButtonElement;
    cancel.click();
    fixture.detectChanges();
    expect(partService['updateReservation']).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('[aria-label="Confirmar cancelamento da reserva"]')!.click();
    expect(partService['updateReservation']).toHaveBeenCalledWith(7, 1, 'cancel');
    expect(toastMessages()).toEqual(['Reserva cancelada e disponibilidade devolvida.']);
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
  });

  it('rotula a observação e permite desistir do cancelamento sem alterar a reserva', async () => {
    await setUp('TECHNICIAN');
    const component = fixture.componentInstance as any;
    component.parts.set({ ...RMA_PARTS, reservations: [{ ...reservation(1, 'ACTIVE'), note: '1' }] });
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.record-row__meta')?.textContent).toContain('Observação: 1');
    root.querySelector<HTMLButtonElement>('[aria-label="Cancelar reserva Capacitor"]')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[aria-label="Manter reserva"]')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[aria-label="Confirmar cancelamento da reserva"]')).toBeNull();
    expect(document.activeElement).toBe(root.querySelector('[aria-label="Cancelar reserva Capacitor"]'));
    expect(partService['updateReservation']).not.toHaveBeenCalled();
  });

  it('devolve o foco à reserva ao desistir pelo Escape', async () => {
    await setUp('TECHNICIAN');
    const root: HTMLElement = fixture.nativeElement;
    const trigger = root.querySelector<HTMLButtonElement>('[aria-label="Cancelar reserva Capacitor"]')!;
    trigger.click(); fixture.detectChanges();
    const cancel = root.querySelector<HTMLButtonElement>('[aria-label="Manter reserva"]')!;
    expect(document.activeElement).toBe(cancel);
    cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(trigger);
    expect(partService['updateReservation']).not.toHaveBeenCalled();
  });

  it('reports pending reservations when stock is insufficient', async () => {
    await setUp('TECHNICIAN');
    const component = fixture.componentInstance as unknown as { reserveForm: { setValue(value: unknown): void }; reserve(): void };
    component.reserveForm.setValue({ partId: 4, quantity: 5, note: '  ' });
    component.reserve();

    expect(partService['reserve']).toHaveBeenCalledWith(7, { partId: 4, quantity: 5, note: null });
    expect(toastMessages()[0]).toContain('pendente de reposição');
    expect(toastTones()).toEqual(['info']);
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
  });

  it.each([[1.0001, false], [1000000000, false], [0.001, true], [1.125, true], [999999999.999, true]])('validates the reserved quantity %s against the contract (accepted=%s)', async (quantity, accepted) => {
    await setUp('TECHNICIAN');
    const component = fixture.componentInstance as unknown as { reserveForm: { setValue(value: unknown): void }; reserve(): void };
    (fixture.componentInstance as any).catalog.set([{ id: 4, unit: 'm', active: true }]);
    component.reserveForm.setValue({ partId: 4, quantity, note: '' });
    component.reserve();
    expect(vi.mocked(partService['reserve']).mock.calls.length).toBe(accepted ? 1 : 0);
  });

  it('only allows cancelling reservations of closed ordens de serviço', async () => {
    await setUp('ADMIN', 'COMPLETED');
    const text: string = fixture.nativeElement.textContent;

    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(text).not.toContain('Aplicar');
    expect(text).not.toContain('Efetivar reserva');
    expect(text).toContain('Cancelar reserva');
  });
  it('opens inline consumption and requires a reason before posting its batch', async () => {
    await setUp('TECHNICIAN');
    const consume = [...fixture.nativeElement.querySelectorAll('button')].find((button: any) => button.textContent.trim() === 'Aplicar') as HTMLButtonElement;
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
    expect(toastMessages()).toEqual(['Aplicação registrada.']);
  });

  it('uses the inline form pattern for reserving, applying, adding externals and voiding', async () => {
    await setUp('TECHNICIAN');
    const root: HTMLElement = fixture.nativeElement;
    expectInlineForm(root.querySelector('#reserve-form'), ['Peça', 'Quantidade'], 'Reservar');
    const component = fixture.componentInstance as any;
    const consume = [...root.querySelectorAll('button')].find((button: any) => button.textContent.trim() === 'Aplicar') as HTMLButtonElement;
    consume.click(); fixture.detectChanges();
    expectInlineForm(root.querySelector('form:not(#reserve-form)'), ['Motivo da troca'], 'Confirmar');
    component.consuming.set(null);
    root.querySelector<HTMLButtonElement>('#external-trigger')!.click(); fixture.detectChanges();
    expectInlineForm(root.querySelector('#external-form'), ['Descrição', 'Quantidade', 'Motivo da troca'], 'Registrar');
  });

  it('shows a missing reason for historic consumption', async () => {
    await setUp('VIEWER');
    expect(fixture.nativeElement.textContent).toContain('Motivo não registrado');
  });

  it('adds an external component inline with trimmed text and a default unit', async () => {
    await setUp('TECHNICIAN');
    const component = fixture.componentInstance as any;
    const service = TestBed.inject(RmaRepairService);
    component.externalForm.setValue({ code: ' ', description: ' Conector ', quantity: 1.125, unit: 'm', componentBatch: ' L1 ', replacementReason: ' Oxidação ' });
    component.saveExternal();
    expect(service.addExternalComponent).toHaveBeenCalledWith(7, { code: null, description: 'Conector', quantity: 1.125, unit: 'm', componentBatch: 'L1', replacementReason: 'Oxidação' });
    expect(toastMessages()).toEqual(['Componente salvo.']);
    expect(toastTones()).toEqual(['success']);
    expect(fixture.nativeElement.querySelector('[role="status"], .muted-inline')).toBeNull();
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
    const buttons = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('form:has([formControlName="replacementReason"]) .inline-form__actions button'));
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

  it('edits external components and requires a reason before voiding', async () => {
    await setUp('TECHNICIAN');
    const service = TestBed.inject(RmaRepairService);
    const update = vi.fn(() => of({})); const voidRecord = vi.fn(() => of({}));
    Object.assign(service, { updateExternalComponent: update, voidExternalComponent: voidRecord });
    const component = fixture.componentInstance as any;
    const item = { id: 8, code: null, description: 'Resistor', quantity: 1, unit: 'un', componentBatch: null, replacementReason: 'Falha' };
    component.editExternal(item); component.externalForm.patchValue({ description: ' Corrigido ' }); component.saveExternal();
    expect(update).toHaveBeenCalledWith(7, 8, expect.objectContaining({ description: 'Corrigido' }));
    component.startVoidExternal(item); component.confirmVoidExternal(); expect(voidRecord).not.toHaveBeenCalled();
    component.voidReason.setValue(' Erro '); component.confirmVoidExternal(); expect(voidRecord).toHaveBeenCalledWith(7, 8, 'Erro');
  });

});
