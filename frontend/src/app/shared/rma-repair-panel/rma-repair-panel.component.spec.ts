import { TestBed } from '@angular/core/testing';
import { Permission } from '../../core/permissions';
import { of } from 'rxjs';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { providePermissions } from '../../testing/permission-fixtures';
import { RmaRepairPanelComponent } from './rma-repair-panel.component';

describe('RmaRepairPanelComponent', () => {
  afterEach(() => localStorage.clear());
  async function setup(permissions: Permission[] = ['rma.diagnosticar'], status = 'IN_REPAIR', interventions: any[] = [{ id: 1, type: 'CLEANING', description: 'Placa limpa', performedOn: '2026-11-12', hours: 1.125, technicianName: 'ana' }]) {
    const service = { getRepair: vi.fn(() => of({ interventions, totalServiceHours: interventions.filter(i => !i.voidedAt).reduce((sum, i) => sum + i.hours, 0) })), updateIntervention: vi.fn(() => of({})), voidIntervention: vi.fn(() => of({})), addIntervention: vi.fn(() => of({})) };
    await TestBed.configureTestingModule({ imports: [RmaRepairPanelComponent], providers: [{ provide: RmaRepairService, useValue: service }, providePermissions(permissions)] }).compileComponents();
    const fixture = TestBed.createComponent(RmaRepairPanelComponent);
    fixture.componentRef.setInput('rmaId', 7); fixture.componentRef.setInput('rmaStatus', status); fixture.detectChanges();
    return { fixture, service, component: fixture.componentInstance as any };
  }
  async function setupEmpty() {
    const r = await setup(['rma.diagnosticar'], 'IN_REPAIR', []);
    return r.fixture;
  }
  it('shows Portuguese labels, technician and total hours', async () => {
    const { fixture } = await setup([]);
    expect(fixture.nativeElement.textContent).toContain('Limpeza');
    expect(fixture.nativeElement.textContent).toContain('ana');
    expect(fixture.nativeElement.textContent).toContain('1,125');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('requires valid description, date and hours and posts a trimmed intervention', async () => {
    const { component, service } = await setup();
    component.save(); expect(service.addIntervention).not.toHaveBeenCalled();
    component.form.setValue({ type: 'CLEANING', description: ' Limpeza ', performedOn: '2026-11-12', hours: 0.125 });
    component.save();
    expect(service.addIntervention).toHaveBeenCalledWith(7, { type: 'CLEANING', description: 'Limpeza', performedOn: '2026-11-12', hours: 0.125 });
  });
  it('blocks future dates, excessive precision and writes after closure', async () => {
    const { component, service } = await setup();
    component.form.setValue({ type: 'CLEANING', description: 'X', performedOn: '2999-01-01', hours: 1 });
    component.save(); expect(service.addIntervention).not.toHaveBeenCalled();
    component.form.patchValue({ performedOn: '2026-11-12', hours: 1.0001 });
    component.save(); expect(service.addIntervention).not.toHaveBeenCalled();
  });
  it('blocks writes after closure', async () => {
    const closed = await setup(['rma.diagnosticar'], 'COMPLETED');
    expect(closed.fixture.nativeElement.querySelector('form')).toBeNull();
    closed.component.form.setValue({ type: 'CLEANING', description: 'X', performedOn: '2026-11-12', hours: 1 });
    closed.component.save(); expect(closed.service.addIntervention).not.toHaveBeenCalled();
  });
  it('edits using the same form and voids only with a reason', async () => {
    const { component, service } = await setup();
    const item = component.repair().interventions[0];
    component.edit(item);
    component.form.patchValue({ description: ' Corrigido ', hours: 2 });
    component.save();
    expect(service.updateIntervention).toHaveBeenCalledWith(7, 1, { type: 'CLEANING', description: 'Corrigido', performedOn: '2026-11-12', hours: 2 });
    component.startVoid(item);
    component.confirmVoid(); expect(service.voidIntervention).not.toHaveBeenCalled();
    component.voidReason.setValue(' Duplicado '); component.confirmVoid();
    expect(service.voidIntervention).toHaveBeenCalledWith(7, 1, 'Duplicado');
  });

  describe('compact layout', () => {
    const trigger = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.repair-trigger')!;
    const open = (fixture: any) => { trigger(fixture.nativeElement).click(); fixture.detectChanges(); };

    it('keeps the form collapsed by default and toggles it with aria-expanded', async () => {
      const { fixture } = await setup();
      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('form')).toBeNull();
      expect(trigger(root).getAttribute('aria-expanded')).toBe('false');
      expect(trigger(root).textContent).toContain('Registrar');
      open(fixture);
      expect(root.querySelector('form')).not.toBeNull();
      expect(trigger(root).getAttribute('aria-expanded')).toBe('true');
      open(fixture);
      expect(root.querySelector('form')).toBeNull();
    });

    it('collapses with Cancelar and Escape, returning focus to the trigger', async () => {
      const { fixture } = await setup();
      const root: HTMLElement = fixture.nativeElement;
      document.body.appendChild(root);
      open(fixture);
      Array.from(root.querySelectorAll<HTMLButtonElement>('form button')).find(b => b.textContent?.trim() === 'Cancelar')!.click(); fixture.detectChanges();
      expect(root.querySelector('form')).toBeNull();
      await fixture.whenStable(); fixture.detectChanges();
      expect(document.activeElement).toBe(trigger(root));
      open(fixture);
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      root.querySelector('form')!.dispatchEvent(esc); fixture.detectChanges();
      expect(root.querySelector('form')).toBeNull();
      root.remove();
    });

    it('shows no error before interaction and an empty hours field', async () => {
      const { fixture, component } = await setup();
      open(fixture);
      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('.field-error')).toBeNull();
      expect(root.querySelector<HTMLInputElement>('input[type=number]')!.value).toBe('');
      expect(root.querySelector<HTMLInputElement>('input[type=number]')!.placeholder).toBe('0,0');
      expect(component.form.controls.hours.value).toBeNull();
    });

    it('reports short errors per field after a submit attempt', async () => {
      const { fixture, service } = await setup();
      open(fixture);
      const root: HTMLElement = fixture.nativeElement;
      root.querySelector('form')!.dispatchEvent(new Event('submit')); fixture.detectChanges();
      const errors = Array.from(root.querySelectorAll('.field-error')).map(e => e.textContent?.trim());
      expect(errors).toEqual(['Informe as horas (maior que 0, até 3 casas)', 'Informe a descrição']);
      expect(service.addIntervention).not.toHaveBeenCalled();
    });

    it('shows a field error once the user touches it', async () => {
      const { fixture } = await setup();
      open(fixture);
      const root: HTMLElement = fixture.nativeElement;
      const hours = root.querySelector<HTMLInputElement>('input[type=number]')!;
      hours.value = '0'; hours.dispatchEvent(new Event('input')); hours.dispatchEvent(new Event('blur')); fixture.detectChanges();
      expect(root.textContent).toContain('Informe as horas (maior que 0, até 3 casas)');
      expect(root.textContent).not.toContain('Informe a descrição');
    });

    it('shows the total only when there are hours and a short empty state otherwise', async () => {
      const withHours = await setup();
      expect(withHours.fixture.nativeElement.querySelector('.repair-total').textContent.trim()).toBe('1,125 h');
      TestBed.resetTestingModule();
      const empty = await setupEmpty();
      expect(empty.nativeElement.querySelector('.repair-total')).toBeNull();
      expect(empty.nativeElement.textContent).not.toContain('Total de horas');
      expect(empty.nativeElement.querySelector('.repair-empty').textContent.trim()).toBe('Nenhuma intervenção');
    });

    it('lists one compact line per record in order and strikes voided ones with the reason', async () => {
      const { fixture } = await setup(['rma.diagnosticar'], 'IN_REPAIR', [
        { id: 1, type: 'CLEANING', description: 'Placa limpa', performedOn: '2026-11-12', hours: 1.5, technicianName: 'ana' },
        { id: 2, type: 'RESOLDERING', description: 'Ressolda errada', performedOn: '2026-11-11', hours: 2, technicianName: 'bia', voidedAt: '2026-11-12T10:00:00Z', voidReason: 'Duplicada', voidedBy: 'admin' }
      ]);
      const lines = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.repair-line'));
      expect(lines).toHaveLength(2);
      const parts = (l: HTMLElement) => [l.querySelector('.repair-line__title')!, l.querySelector('.repair-line__meta')!, l.querySelector('.repair-line__value')!, l.querySelector('.repair-line__desc')!].map(e => e.textContent!.trim());
      expect(parts(lines[0])).toEqual(['Limpeza', '12/11/2026 · ana', '1,5 h', 'Placa limpa']);
      expect(lines[0].querySelector('.repair-line__desc')!.getAttribute('title')).toBe('Placa limpa');
      expect(lines[1].querySelector('.repair-voided')).not.toBeNull();
      expect(lines[1].querySelector('[aria-label*="Editar"]')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Anulada: Duplicada · admin');
    });
  });
});
