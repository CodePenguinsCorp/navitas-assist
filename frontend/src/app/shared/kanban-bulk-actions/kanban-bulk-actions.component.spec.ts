import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { RmaResponse } from '../../core/models';
import { RmaService } from '../../core/services/rma.service';
import { BulkRmaResult, KanbanBulkActionsComponent } from './kanban-bulk-actions.component';

describe('KanbanBulkActionsComponent', () => {
  let fixture: ComponentFixture<KanbanBulkActionsComponent>;
  let service: { updateStatusInBulk: ReturnType<typeof vi.fn>; updatePriority: ReturnType<typeof vi.fn>; updateAssignee: ReturnType<typeof vi.fn>; getById: ReturnType<typeof vi.fn> };
  const rmas = [{ id: 1, code: 'RMA-1', status: 'RECEIVED' }, { id: 2, code: 'RMA-2', status: 'RECEIVED' }] as RmaResponse[];
  const button = (text: string) => [...fixture.nativeElement.querySelectorAll('button')].find((element) => (element as HTMLButtonElement).textContent?.includes(text)) as HTMLButtonElement;
  const submit = () => fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  beforeEach(async () => {
    service = { updateStatusInBulk: vi.fn(), updatePriority: vi.fn(), updateAssignee: vi.fn(), getById: vi.fn() };
    await TestBed.configureTestingModule({ imports: [KanbanBulkActionsComponent], providers: [{ provide: RmaService, useValue: service }] }).compileComponents();
    fixture = TestBed.createComponent(KanbanBulkActionsComponent);
    fixture.componentRef.setInput('selection', rmas);
    fixture.componentRef.setInput('canUpdateStatus', true);
    fixture.componentRef.setInput('canManage', true);
    fixture.componentRef.setInput('assigneeOptions', [{ value: null, label: 'Sem responsável' }]);
    fixture.detectChanges();
  });

  it('requires confirmation and cancels without sending requests', () => {
    button('Alterar status').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain('2 RMA(s)');
    expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain('Selecione o novo status');
    expect(button('Aplicar a').disabled).toBe(true);
    expect(service.updateStatusInBulk).not.toHaveBeenCalled();
    button('Cancelar').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(service.updateStatusInBulk).not.toHaveBeenCalled();
  });

  it('allows moving mixed cards backward and reopening a returned RMA', () => {
    fixture.componentRef.setInput('selection', [{ ...rmas[0], status: 'TRIAGE' }, { ...rmas[1], status: 'RETURNED' }]);
    fixture.detectChanges();
    service.updateStatusInBulk.mockImplementation((id: number) => of({ ...rmas[id - 1], status: 'RECEIVED' }));
    button('Alterar status').click();
    expect(fixture.componentInstance['statusOptions'].map((option) => option.value)).toContain('RECEIVED');
    fixture.componentInstance['form'].controls.status.setValue('RECEIVED');
    fixture.detectChanges();
    expect(button('Aplicar a').disabled).toBe(false);
    submit();
    expect(service.updateStatusInBulk).toHaveBeenCalledWith(1, { status: 'RECEIVED', note: null, expectedStatus: 'TRIAGE' });
    expect(service.updateStatusInBulk).toHaveBeenCalledWith(2, { status: 'RECEIVED', note: null, expectedStatus: 'RETURNED' });
  });

  it('reports partial success per RMA and uses the confirmed selection snapshot', () => {
    service.updateStatusInBulk.mockImplementation((id: number) => id === 1 ? of({ ...rmas[0], status: 'TRIAGE' }) : throwError(() => ({ error: { message: 'Etapa inválida' } })));
    let results: BulkRmaResult[] = [];
    fixture.componentInstance.applied.subscribe((value) => results = value);
    button('Alterar status').click();
    fixture.detectChanges();
    fixture.componentInstance['form'].controls.status.setValue('TRIAGE');
    fixture.componentRef.setInput('selection', [rmas[0]]);
    submit();
    fixture.detectChanges();
    expect(service.updateStatusInBulk).toHaveBeenCalledTimes(2);
    expect(service.updateStatusInBulk).toHaveBeenCalledWith(1, { status: 'TRIAGE', note: null, expectedStatus: 'RECEIVED' });
    expect(results.map((result) => [result.id, result.success])).toEqual([[1, true], [2, false]]);
    expect(fixture.nativeElement.textContent).toContain('1 atualizado(s); 1 com falha');
    expect(fixture.nativeElement.textContent).toContain('Etapa inválida');
  });

  it('refreshes only a card whose status changed after selection', () => {
    service.updateStatusInBulk.mockImplementation((id: number) => id === 1
      ? throwError(() => ({ error: { message: 'RMA status changed. Refresh the item before trying again.' } }))
      : of({ ...rmas[1], status: 'TRIAGE' }));
    service.getById.mockReturnValue(of({ ...rmas[0], status: 'IN_DIAGNOSIS' }));
    let results: BulkRmaResult[] = [];
    fixture.componentInstance.applied.subscribe((value) => results = value);
    button('Alterar status').click();
    fixture.detectChanges();
    fixture.componentInstance['form'].controls.status.setValue('TRIAGE');
    submit();
    expect(service.getById).toHaveBeenCalledExactlyOnceWith(1);
    expect(results.map((result) => [result.success, result.rma?.status])).toEqual([[false, 'IN_DIAGNOSIS'], [true, 'TRIAGE']]);
  });

  it('prevents double submission while requests are pending', () => {
    const pending = new Subject<RmaResponse>();
    service.updatePriority.mockReturnValue(pending);
    const busy: boolean[] = [];
    fixture.componentInstance.busyChange.subscribe((value) => busy.push(value));
    button('Alterar prioridade').click();
    fixture.detectChanges();
    submit();
    submit();
    expect(service.updatePriority).toHaveBeenCalledTimes(2);
    pending.next(rmas[0]);
    pending.complete();
    expect(busy).toEqual([true, false]);
  });

  it('limits simultaneous requests and continues after an item fails', () => {
    const pending = Array.from({ length: 6 }, () => new Subject<RmaResponse>());
    fixture.componentRef.setInput('selection', pending.map((_, i) => ({ id: i, code: `RMA-${i}`, status: 'RECEIVED' })));
    fixture.detectChanges();
    service.updatePriority.mockImplementation((id: number) => pending[id]);
    button('Alterar prioridade').click();
    fixture.detectChanges();
    submit();
    expect(service.updatePriority).toHaveBeenCalledTimes(4);
    pending[0].error({ error: { message: 'Falha' } });
    expect(service.updatePriority).toHaveBeenCalledTimes(5);
    for (let i = 1; i < 6; i++) { pending[i].next({ id: i } as RmaResponse); pending[i].complete(); }
    fixture.detectChanges();
    expect(service.updatePriority).toHaveBeenCalledTimes(6);
    expect(fixture.nativeElement.textContent).toContain('5 atualizado(s); 1 com falha');
  });

  it('allows removing the assignee explicitly', () => {
    service.updateAssignee.mockReturnValue(of(rmas[0]));
    button('Alterar responsável').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain('Sem responsável');
    submit();
    expect(service.updateAssignee).toHaveBeenCalledWith(1, { assigneeId: null });
    expect(service.updateAssignee).toHaveBeenCalledWith(2, { assigneeId: null });
  });

  it('offers technicians only status changes and sends nothing for an empty selection', () => {
    fixture.componentRef.setInput('canManage', false);
    fixture.detectChanges();
    expect(button('Alterar prioridade')).toBeUndefined();
    expect(button('Alterar responsável')).toBeUndefined();
    expect(button('Alterar status')).toBeDefined();
    fixture.componentRef.setInput('selection', []);
    fixture.detectChanges();
    expect(button('Alterar status').disabled).toBe(true);
    expect(service.updateStatusInBulk).not.toHaveBeenCalled();
  });
});
