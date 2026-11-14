import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AssignableUserResponse, RmaResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { buildRma } from '../../testing/rma-fixtures';
import { RmaAssigneeFieldComponent, assigneeSelectOptions } from './rma-assignee-field.component';

describe('RmaAssigneeFieldComponent', () => {
  let fixture: ComponentFixture<RmaAssigneeFieldComponent>;
  let calls: Array<[number, number | null]>;
  let userLoads: number;
  let users: () => Observable<AssignableUserResponse[]>;
  let response: (assigneeId: number | null) => Observable<RmaResponse>;
  let saved: RmaResponse[];
  let busy: boolean[];

  const RMA = buildRma({ id: 4, status: 'TRIAGE', assigneeId: 7, assigneeName: 'Rafael Almeida' });
  const USERS: AssignableUserResponse[] = [
    { id: 7, username: 'rafael', fullName: 'Rafael Almeida' },
    { id: 9, username: 'bia', fullName: 'Beatriz Souza' }
  ];

  beforeEach(async () => {
    calls = [];
    userLoads = 0;
    saved = [];
    busy = [];
    users = () => of(USERS);
    response = (assigneeId) => of({ ...RMA, assigneeId, assigneeName: USERS.find((user) => user.id === assigneeId)?.fullName ?? null });
    await TestBed.configureTestingModule({
      imports: [RmaAssigneeFieldComponent],
      providers: [
        { provide: CatalogService, useValue: { listAssignableUsers: () => { userLoads++; return users(); } } },
        { provide: RmaService, useValue: { updateAssignee: (id: number, payload: { assigneeId: number | null }) => { calls.push([id, payload.assigneeId]); return response(payload.assigneeId); } } }
      ]
    }).compileComponents();
  });

  function mount(options: { rma?: RmaResponse; canEdit?: boolean; disabled?: boolean } = {}): void {
    fixture = TestBed.createComponent(RmaAssigneeFieldComponent);
    fixture.componentRef.setInput('rma', options.rma ?? RMA);
    fixture.componentRef.setInput('canEdit', options.canEdit ?? true);
    fixture.componentRef.setInput('disabled', options.disabled ?? false);
    fixture.componentInstance.saved.subscribe((rma: RmaResponse) => saved.push(rma));
    fixture.componentInstance.busyChange.subscribe((value: boolean) => busy.push(value));
    fixture.detectChanges();
  }

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const trigger = () => host().querySelector<HTMLButtonElement>('.custom-select__trigger');
  const option = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('.custom-select__option')].find((item) => text(item.querySelector('.custom-select__name')) === label);
  function choose(label: string): void {
    trigger()!.click();
    fixture.detectChanges();
    option(label)!.click();
    fixture.detectChanges();
  }

  it('shows the current assignee as an action menu that lists the eligible users', () => {
    mount();
    expect(trigger()!.getAttribute('aria-label')).toBe('Trocar responsável, atual: Rafael Almeida');
    trigger()!.click();
    fixture.detectChanges();
    const names = [...document.querySelectorAll('.custom-select__option .custom-select__name')].map(text);
    expect(names).toEqual(['Sem responsável', 'Rafael Almeida', 'Beatriz Souza']);
    expect(userLoads).toBe(1);
  });

  it('saves through the assignment endpoint and reports the new assignee', () => {
    mount();
    choose('Beatriz Souza');
    expect(calls).toEqual([[4, 9]]);
    expect(saved.map((rma) => rma.assigneeId)).toEqual([9]);
    expect(busy).toEqual([true, false]);
    expect(text(host().querySelector('[role="status"]'))).toBe('Responsável alterado para Beatriz Souza');
  });

  it('can leave the OS without an assignee', () => {
    mount();
    choose('Sem responsável');
    expect(calls).toEqual([[4, null]]);
    expect(text(host().querySelector('[role="status"]'))).toBe('OS sem responsável');
  });

  it('does nothing when the current assignee is chosen again', () => {
    mount();
    choose('Rafael Almeida');
    expect(calls).toEqual([]);
    expect(saved).toEqual([]);
  });

  it('keeps the selector disabled while saving', () => {
    const pending = new Subject<RmaResponse>();
    response = () => pending;
    mount();
    choose('Beatriz Souza');
    expect(trigger()!.disabled).toBe(true);
    pending.next({ ...RMA, assigneeId: 9, assigneeName: 'Beatriz Souza' });
    pending.complete();
    fixture.detectChanges();
    expect(trigger()!.disabled).toBe(false);
  });

  it('shows the API error inline', () => {
    response = () => throwError(() => ({ error: { message: 'Usuário não pode receber OS.' } }));
    mount();
    choose('Beatriz Souza');
    expect(text(host().querySelector('[role="alert"]'))).toBe('Usuário não pode receber OS.');
    expect(saved).toEqual([]);
  });

  it('says when the users cannot be loaded', () => {
    users = () => throwError(() => ({}));
    mount();
    expect(text(host().querySelector('[role="alert"]'))).toBe('Não foi possível carregar os responsáveis.');
  });

  it('shows only the person, without loading users, when the profile cannot assign', () => {
    mount({ canEdit: false });
    expect(trigger()).toBeNull();
    expect(text(host().querySelector('.person'))).toContain('Rafael Almeida');
    expect(text(host().querySelector('.person .avatar'))).toBe('RA');
    expect(userLoads).toBe(0);
  });

  it('blocks the selector while the host is writing something else', () => {
    mount({ disabled: true });
    expect(trigger()!.disabled).toBe(true);
  });

  it('keeps a current assignee who can no longer receive OSs, disabled', () => {
    const options = assigneeSelectOptions({ assigneeId: 3, assigneeName: 'Ana' }, USERS);
    expect(options.at(-1)).toMatchObject({ value: 3, label: 'Ana', disabled: true });
  });
});
