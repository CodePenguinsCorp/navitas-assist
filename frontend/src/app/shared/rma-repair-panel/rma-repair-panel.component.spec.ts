import { TestBed } from '@angular/core/testing';
import { Permission } from '../../core/permissions';
import { of } from 'rxjs';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { providePermissions } from '../../testing/permission-fixtures';
import { RmaRepairPanelComponent } from './rma-repair-panel.component';

describe('RmaRepairPanelComponent', () => {
  async function setup(permissions: Permission[] = ['rma.diagnosticar'], status = 'IN_REPAIR') {
    const service = { getRepair: vi.fn(() => of({ interventions: [{ id: 1, type: 'CLEANING', description: 'Placa limpa', performedOn: '2026-11-12', hours: 1.125, technicianName: 'ana' }], totalServiceHours: 1.125 })), addIntervention: vi.fn(() => of({})) };
    await TestBed.configureTestingModule({ imports: [RmaRepairPanelComponent], providers: [{ provide: RmaRepairService, useValue: service }, providePermissions(permissions)] }).compileComponents();
    const fixture = TestBed.createComponent(RmaRepairPanelComponent);
    fixture.componentRef.setInput('rmaId', 7); fixture.componentRef.setInput('rmaStatus', status); fixture.detectChanges();
    return { fixture, service, component: fixture.componentInstance as any };
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
});
