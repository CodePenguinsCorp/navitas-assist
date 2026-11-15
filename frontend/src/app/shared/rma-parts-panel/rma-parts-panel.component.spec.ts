import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { PartUsageResponse, RmaPartsResponse, RmaStatus } from '../../core/models';
import { PartService } from '../../core/services/part.service';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { ToastService } from '../../core/services/toast.service';
import { providePermissions, profilePermissions, LegacyProfileCode } from '../../testing/permission-fixtures';
import { RmaPartsPanelComponent } from './rma-parts-panel.component';

const usage = (id = 1, status: PartUsageResponse['status'] = 'USED'): PartUsageResponse => ({
  id, rmaId: 7, rmaCode: 'OS-7', partId: 4, partCode: 'PCA-1', partName: 'Capacitor', unit: 'UN', location: null,
  quantity: 2, status, partOnHand: 3, unitCost: 10, totalCost: 20, notes: 'Conferido',
  replacementReason: 'Curto', componentBatch: 'L1', appliedAt: '2026-10-24T12:00:00Z', appliedBy: 'tech',
  createdBy: 'tech', createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
});
const response = (usages = [usage()]): RmaPartsResponse => ({ rmaId: 7, rmaCode: 'OS-7', usages,
  movements: [], usedCost: usages.filter(u => u.status === 'USED').length * 20,
  replacedComponents: usages.filter(u => u.status === 'USED') });

describe('RmaPartsPanelComponent - uso de peças', () => {
  let fixture: ComponentFixture<RmaPartsPanelComponent>;
  let service: { getRmaParts: ReturnType<typeof vi.fn>; listOptions: ReturnType<typeof vi.fn>; use: ReturnType<typeof vi.fn>; undoUse: ReturnType<typeof vi.fn> };
  const root = (): HTMLElement => fixture.nativeElement;
  const text = () => root().textContent ?? '';
  const component = () => fixture.componentInstance as any;
  const render = () => fixture.detectChanges();
  const button = (label: string) => Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === label);
  async function setUp(role: LegacyProfileCode = 'TECHNICIAN', status: RmaStatus = 'IN_REPAIR') {
    service = { getRmaParts: vi.fn(() => of(response())), listOptions: vi.fn(() => of([
      { id: 4, code: 'PCA-1', name: 'Capacitor', unit: 'UN', onHand: 3, active: true },
      { id: 5, code: 'CABO', name: 'Cabo', unit: 'm', onHand: 10, active: true }
    ])), use: vi.fn(() => of(usage())), undoUse: vi.fn(() => of(usage(1, 'REVERTED'))) };
    await TestBed.configureTestingModule({ imports: [RmaPartsPanelComponent], providers: [provideHttpClient(),
      providePermissions(profilePermissions(role)), { provide: PartService, useValue: service },
      { provide: RmaRepairService, useValue: { listExternalComponents: vi.fn(() => of([])), addExternalComponent: vi.fn(() => of({})) } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(RmaPartsPanelComponent);
    fixture.componentRef.setInput('rmaId', 7); fixture.componentRef.setInput('rmaStatus', status);
    render(); await fixture.whenStable(); render();
  }
  afterEach(() => { fixture?.destroy(); localStorage.clear(); });

  it('mostra identificação, motivo, lote, autoria, observação e custo no padrão de registros', async () => {
    await setUp();
    const row = root().querySelector('[aria-label="Peças usadas"] .record-row')!;
    for (const value of ['Capacitor', 'PCA-1', '2 UN', 'Usada', 'Curto', 'L1', 'tech', 'Conferido']) expect(row.textContent).toContain(value);
    expect(row.querySelector('.record-row__actions button')?.getAttribute('aria-label')).toContain('Desfazer uso');
    expect(text()).toContain('Peças usadas'); expect(text()).toContain('Custo das peças');
    expect(text()).toMatch(/R\$\s*20,00/); expect(text()).toContain('Componentes trocados');
  });

  it('abre formulário inline e valida quantidade e motivo por campo antes de enviar', async () => {
    await setUp(); root().querySelector<HTMLButtonElement>('#usage-trigger')!.click(); render();
    component().usageForm.patchValue({ partId: 4, quantity: 1.5, replacementReason: '  ' });
    component().use(); render(); expect(service.use).not.toHaveBeenCalled();
    expect(text()).toContain('Em estoque: 3 UN');
    expect(root().querySelector('#usage-quantity-error')?.textContent).toContain('número inteiro');
    component().usageForm.patchValue({ partId: 5, quantity: 1.5, replacementReason: ' Falha ', componentBatch: ' L2 ', notes: ' Conferido ' });
    component().use(); render();
    expect(service.use).toHaveBeenCalledWith(7, { partId: 5, quantity: 1.5, replacementReason: 'Falha', componentBatch: 'L2', notes: 'Conferido' });
    expect(TestBed.inject(ToastService).toasts().map(t => t.message)).toContain('Peça usada.');
  });

  it('exibe estoque insuficiente sem apagar a leitura ou fechar o formulário', async () => {
    await setUp(); service.use.mockReturnValue(throwError(() => ({ error: { message: 'Estoque insuficiente para a peça PCA-1. Em estoque: 3.' } })));
    component().usageOpen.set(true); component().usageForm.patchValue({ partId: 4, quantity: 4, replacementReason: 'Falha' }); component().use(); render();
    expect(text()).toContain('Estoque insuficiente'); expect(root().querySelector('#usage-form')).not.toBeNull();
    expect(text()).toContain('Capacitor'); expect(service.getRmaParts).toHaveBeenCalledTimes(1);
  });

  it('exige motivo no modal e reverte o uso uma ?nica vez durante o envio', async () => {
    await setUp(); root().querySelector<HTMLButtonElement>('[aria-label="Desfazer uso Capacitor"]')!.click(); render();
    expect(root().querySelector('[role="alertdialog"] h3')?.textContent).toBe('Desfazer uso?');
    button('Reverter')!.click(); render(); expect(service.undoUse).not.toHaveBeenCalled();
    const pending = new Subject<PartUsageResponse>(); service.undoUse.mockReturnValue(pending);
    component().undoReason.setValue(' Erro '); button('Reverter')!.click(); component().confirmUndo(); render();
    expect(service.undoUse).toHaveBeenCalledTimes(1); expect(service.undoUse).toHaveBeenCalledWith(7, 1, 'Erro');
    pending.next(usage(1, 'REVERTED')); pending.complete(); render();
    expect(root().querySelector('[role="alertdialog"]')).toBeNull();
    expect(TestBed.inject(ToastService).toasts().map(t => t.message)).toContain('Uso desfeito.');
  });

  it.each(['COMPLETED', 'RETURNED', 'IRREPARABLE'] as RmaStatus[])('bloqueia uso e reversão na OS %s', async status => {
    await setUp('TECHNICIAN', status); expect(root().querySelector('#usage-trigger')).toBeNull();
    expect(root().querySelector('[aria-label="Desfazer uso Capacitor"]')).toBeNull();
    component().use(); component().startUndo(usage()); expect(service.use).not.toHaveBeenCalled();
  });

  it('mantém histórico revertido sem ação e sem incluí-lo nos custos e componentes', async () => {
    await setUp(); component().parts.set(response([usage(1, 'REVERTED')])); render();
    expect(text()).toContain('Uso desfeito'); expect(text()).toMatch(/R\$\s*0,00/);
    expect(root().querySelector('[aria-label="Desfazer uso Capacitor"]')).toBeNull();
    expect(text()).toContain('Nenhum componente trocado');
  });

  it('mantém o vazio sem ação duplicada e oculta o vazio quando o formulário abre', async () => {
    await setUp(); component().parts.set(response([])); render(); expect(text()).toContain('Nenhuma peça usada');
    root().querySelector<HTMLButtonElement>('#usage-trigger')!.click(); render(); expect(text()).not.toContain('Nenhuma peça usada');
    expect(Array.from(root().querySelectorAll('button')).filter(b => b.textContent?.trim() === 'Usar peça')).toHaveLength(2);
  });

  it('permite leitura sem ações para o observador', async () => {
    await setUp('VIEWER'); expect(root().querySelector('#usage-trigger')).toBeNull();
    expect(root().querySelector('[aria-label="Desfazer uso Capacitor"]')).toBeNull();
  });

  it('mostra falha e nova tentativa sem apresentar vazio', async () => {
    await setUp(); service.getRmaParts.mockReturnValueOnce(throwError(() => ({ error: { message: 'Falha na leitura.' } })));
    component().retryLoad(); render(); expect(text()).toContain('Falha na leitura.'); expect(text()).not.toContain('Nenhuma peça usada');
    button('Tentar novamente')!.click(); render(); expect(text()).toContain('Capacitor');
  });

  it('ignora leitura antiga ao trocar de OS e reinicia os formulários', async () => {
    await setUp(); const stale = new Subject<RmaPartsResponse>(); service.getRmaParts.mockReturnValueOnce(stale);
    component().retryLoad(); fixture.componentRef.setInput('rmaId', 8); render();
    stale.next(response([{ ...usage(), partName: 'Leitura antiga' }])); render();
    expect(text()).not.toContain('Leitura antiga'); expect(root().querySelector('#usage-form')).toBeNull();
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
