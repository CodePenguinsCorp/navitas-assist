import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PartReservationResponse, RmaPartsResponse } from '../../core/models';
import { Permission } from '../../core/permissions';
import { PartService } from '../../core/services/part.service';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { providePermissions } from '../../testing/permission-fixtures';
import { RmaPartsPanelComponent } from './rma-parts-panel.component';

const reservation = (id: number, status: PartReservationResponse['status']): PartReservationResponse => ({
  id, rmaId: 7, rmaCode: 'RMA-7', partId: 4, partCode: 'PCA-1', partName: 'Capacitor', unit: 'un', location: 'A1', quantity: 2, status,
  partAvailable: 3, unitCost: 10, totalCost: 20, note: null, createdBy: 'tech', createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
});

describe('RmaPartsPanelComponent compact sections', () => {
  afterEach(() => localStorage.clear());
  let fixture: ComponentFixture<RmaPartsPanelComponent>;
  const root = (): HTMLElement => fixture.nativeElement;
  const trigger = (id: string) => root().querySelector<HTMLButtonElement>(`#${id}`)!;
  const click = (id: string) => { trigger(id).click(); fixture.detectChanges(); };
  const errors = () => Array.from(root().querySelectorAll('.field-error')).map((e) => e.textContent?.trim());

  async function setup(parts: Partial<RmaPartsResponse> = {}, permissions: Permission[] = ['rma.ver', 'pecas.ver', 'pecas.reservar']) {
    const response: RmaPartsResponse = { rmaId: 7, rmaCode: 'RMA-7', reservations: [], movements: [], reservedCost: 0, consumedCost: 0, pendingCount: 0, ...parts };
    await TestBed.configureTestingModule({
      imports: [RmaPartsPanelComponent],
      providers: [
        { provide: PartService, useValue: { getRmaParts: () => of(response), list: () => of([]), reserve: vi.fn(() => of(reservation(9, 'ACTIVE'))), updateReservation: vi.fn() } },
        { provide: RmaRepairService, useValue: { listExternalComponents: () => of([]), addExternalComponent: vi.fn(() => of({ id: 8 })) } },
        providePermissions(permissions)
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(RmaPartsPanelComponent);
    fixture.componentRef.setInput('rmaId', 7);
    fixture.componentRef.setInput('rmaStatus', 'IN_REPAIR');
    fixture.detectChanges();
  }

  it('keeps reserve and external forms collapsed, with section actions at the right of the headers', async () => {
    await setup();
    expect(root().querySelector('form')).toBeNull();
    expect(trigger('reserve-trigger').textContent).toContain('Reservar peça');
    expect(trigger('external-trigger').textContent).toContain('Adicionar fora do estoque');
    expect(trigger('reserve-trigger').closest('.collapsible__head')!.querySelector('h3')!.textContent!.trim()).toBe('Peças');
    expect(trigger('external-trigger').closest('.collapsible__head')!.querySelector('h3')!.textContent!.trim()).toBe('Componentes trocados');
    expect(trigger('reserve-trigger').getAttribute('aria-expanded')).toBe('false');
    expect(trigger('external-trigger').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows short empty states and no strip of zeros', async () => {
    await setup();
    expect(root().querySelector('.parts-stats')).toBeNull();
    expect(Array.from(root().querySelectorAll('.repair-empty')).map((e) => e.textContent?.trim())).toEqual(['Nenhuma peça reservada', 'Nenhum componente trocado']);
  });

  it('expands and collapses the reserve form with aria-expanded and focuses its first field', async () => {
    await setup();
    document.body.appendChild(root());
    click('reserve-trigger');
    expect(root().querySelector('#reserve-form')).not.toBeNull();
    expect(trigger('reserve-trigger').getAttribute('aria-expanded')).toBe('true');
    expect(errors()).toEqual([]);
    await fixture.whenStable();
    expect(root().querySelector('#reserve-form')!.contains(document.activeElement)).toBe(true);
    root().querySelector('#reserve-form')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root().querySelector('#reserve-form')).toBeNull();
    await fixture.whenStable();
    expect(document.activeElement).toBe(trigger('reserve-trigger'));
    root().remove();
  });

  it('validates the reserve form per field only after a submit attempt', async () => {
    await setup();
    click('reserve-trigger');
    expect(errors()).toEqual([]);
    root().querySelector('#reserve-form')!.dispatchEvent(new Event('submit')); fixture.detectChanges();
    expect(errors()).toEqual(['Selecione a peça.']);
  });

  it('validates the external component form per field with short messages', async () => {
    await setup();
    click('external-trigger');
    expect(errors()).toEqual([]);
    root().querySelector('#external-form')!.dispatchEvent(new Event('submit')); fixture.detectChanges();
    expect(errors()).toEqual(['Informe a descrição', 'Informe o motivo da troca']);
    click('external-trigger');
    expect(root().querySelector('#external-form')).toBeNull();
  });

  it('shows only non-zero figures in one strip and hides costs without pecas.ver', async () => {
    const parts = { reservations: [reservation(1, 'ACTIVE')], reservedCost: 20, consumedCost: 0, pendingCount: 0 };
    await setup(parts);
    expect(Array.from(root().querySelectorAll('.parts-stats dt')).map((e) => e.textContent)).toEqual(['Ativas', 'Custo reservado']);
    TestBed.resetTestingModule();
    await setup(parts, ['rma.ver', 'pecas.reservar']);
    expect(Array.from(root().querySelectorAll('.parts-stats dt')).map((e) => e.textContent)).toEqual(['Ativas']);
  });

  it('writes Aplicar and Aplicada instead of the old verb', async () => {
    await setup({ reservations: [reservation(1, 'ACTIVE'), reservation(2, 'CONSUMED')], movements: [] });
    expect(root().textContent).toContain('Aplicar');
    expect(root().textContent).toContain('Aplicada');
    expect(root().textContent).not.toMatch(/consum/i);
  });
});
