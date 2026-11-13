import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { RmaResponse } from '../../core/models';
import { RmaService } from '../../core/services/rma.service';
import { buildRma } from '../../testing/rma-fixtures';
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';
import { RmaDueDateDialogComponent } from './rma-due-date-dialog.component';

describe('RmaDueDateDialogComponent', () => {
  let fixture: ComponentFixture<RmaDueDateDialogComponent>;
  let calls: Array<[number, string | null]>;
  let response: () => ReturnType<RmaService['updateDueDate']>;
  let saved: RmaResponse[];
  let closed: number;

  const RMA = buildRma({ id: 4, code: 'RMA-2026-000004', entryDate: '2026-11-02', dueDate: '2026-11-20' });

  beforeEach(async () => {
    calls = [];
    saved = [];
    closed = 0;
    response = () => of({ ...RMA, dueDate: '2026-11-25' });
    await TestBed.configureTestingModule({
      imports: [RmaDueDateDialogComponent],
      providers: [{
        provide: RmaService,
        useValue: { updateDueDate: (id: number, dueDate: string | null) => { calls.push([id, dueDate]); return response(); } }
      }]
    }).compileComponents();
    fixture = TestBed.createComponent(RmaDueDateDialogComponent);
    fixture.componentRef.setInput('rma', RMA);
    fixture.componentInstance.saved.subscribe((rma) => saved.push(rma));
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
  });

  const host = () => fixture.nativeElement as HTMLElement;
  const form = () => (fixture.componentInstance as unknown as { form: { controls: { dueDate: { value: string; setValue(value: string): void } } } }).form;
  const buttons = () => [...host().querySelectorAll<HTMLButtonElement>('.form-actions button')];
  const submit = () => {
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  it('opens with the current due date and entry date as minimum', () => {
    expect(host().querySelector('#rma-due-date-title')?.textContent?.trim()).toBe('Data limite');
    expect(form().controls.dueDate.value).toBe('2026-11-20');
    const picker = fixture.debugElement.query((node) => node.name === 'app-date-picker');
    expect(picker.componentInstance.minDate()).toBe('2026-11-02');
    expect(picker.componentInstance.allowClear()).toBe(true);
  });

  it('sends dueDate when a date is chosen', () => {
    form().controls.dueDate.setValue('2026-11-25');
    submit();
    expect(calls).toEqual([[4, '2026-11-25']]);
    expect(saved.map((rma) => rma.dueDate)).toEqual(['2026-11-25']);
  });

  it('sends clearDueDate when the field is cleared', () => {
    form().controls.dueDate.setValue('');
    submit();
    // RmaService.updateDueDate turns null into { clearDueDate: true } (rma.service.spec.ts).
    expect(calls).toEqual([[4, null]]);
  });

  it('shows the server error inside the modal and keeps it open', () => {
    response = () => throwError(() => ({ error: { message: 'Due date cannot be before entry date.' } }));
    submit();
    const alert = host().querySelector('[role="dialog"] .alert-banner--error');
    expect(alert?.textContent?.trim()).toBe('Due date cannot be before entry date.');
    expect(saved).toEqual([]);
    expect(closed).toBe(0);

    response = () => throwError(() => ({}));
    submit();
    expect(host().querySelector('.alert-banner--error')?.textContent?.trim()).toBe('Não foi possível salvar a data limite.');
  });

  it('blocks a date before the entry without a request', () => {
    form().controls.dueDate.setValue('2026-11-01');
    submit();
    expect(calls).toEqual([]);
    expect(host().querySelector('.alert-banner--error')?.textContent?.trim()).toBe('A data limite não pode ser anterior à entrada.');
  });

  it('Cancelar is the first button and closes without a request', () => {
    const [cancel, save] = buttons();
    expect(cancel.textContent?.trim()).toBe('Cancelar');
    expect(cancel.className).toContain('button-secondary');
    expect(save.textContent?.trim()).toBe('Salvar');
    expect(save.className).toContain('button-primary');
    cancel.click();
    expect(closed).toBe(1);
    expect(calls).toEqual([]);
  });

  it('shows Salvando... while busy', () => {
    const pending = new Subject<RmaResponse>();
    response = () => pending;
    submit();
    expect(buttons()[1].textContent?.trim()).toBe('Salvando...');
    expect(buttons()[1].disabled).toBe(true);
    pending.next(RMA);
    pending.complete();
    fixture.detectChanges();
    expect(buttons()[1].textContent?.trim()).toBe('Salvar');
  });

  it('traps focus with appModalFocus', () => {
    const dialog = fixture.debugElement.query((node) => node.attributes['role'] === 'dialog');
    expect(dialog.injector.get(ModalFocusDirective)).toBeTruthy();
    expect(dialog.attributes['aria-modal']).toBe('true');
    expect(host().textContent).not.toMatch(/SLA|vencid/i);
  });
});
