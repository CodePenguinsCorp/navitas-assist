import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssignableUserResponse, KanbanViewResponse, RmaResponse, RmaStatus, WarrantyStatus } from '../../core/models';
import { RMA_STATUS_LABELS } from '../../core/mock-data';
import { AuthService } from '../../core/services/auth.service';
import { KanbanComponent } from './kanban.component';

type Mode = 'view-create' | 'view-rename' | 'status' | 'assignment';
const modes: Mode[] = ['view-create', 'view-rename', 'status', 'assignment'];
const timestamp = '2026-10-20T12:00:00Z';
const initialView: KanbanViewResponse = {
  id: 5, name: 'Visão inicial', defaultView: true, createdAt: timestamp, updatedAt: timestamp,
  filters: { query: null, priority: null, status: null, warranty: null, assigneeId: null, unassignedOnly: false,
    entryFrom: null, entryTo: null, updatedFrom: null, updatedTo: null }
};
const assignees: AssignableUserResponse[] = [
  { id: 7, username: 'initial.tech', fullName: 'Técnica inicial' },
  { id: 8, username: 'other.tech', fullName: 'Outra técnica' }
];
const initialRma: RmaResponse = {
  id: 1, code: 'RMA-2026-000001', clientId: 1, clientName: 'Cliente',
  items: [{ id: 1, productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null,
    serialNumber: 'SER-2', manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: null, warrantyStatus: WarrantyStatus.PENDING }],
  productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null, serialNumber: 'SER-2',
  manufacturedAt: null, purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-10-20',
  invoiceNumber: null, receivedBy: 'tester', reportedFailure: 'Falha', receivedAccessories: null,
  physicalCondition: null, priority: 'MEDIUM', status: 'RECEIVED', assigneeId: 7, assigneeName: 'Técnica inicial',
  repairSummary: null, replacedPartsSummary: null, testSummary: null, shippedAt: null, carrier: null,
  trackingCode: null, diagnosis: null, statusHistory: [], assignmentHistory: [],
  sla: { status: 'NORMAL', startedAt: timestamp, warningAt: '2026-10-21T07:12:00Z',
    dueAt: '2026-10-21T12:00:00Z', elapsedSeconds: 0, limitSeconds: 86400 },
  createdAt: timestamp, updatedAt: timestamp
};

describe('KanbanComponent pending submissions', () => {
  let fixture: ComponentFixture<KanbanComponent>;
  let http: HttpTestingController;
  let page: HTMLElement;
  let currentRma: RmaResponse;
  let currentView: KanbanViewResponse;
  let nextViewId: number;
  let expectedViewName: string;
  let expectedStatus: RmaStatus;
  let expectedAssignee: number | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KanbanComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush({
      id: 99, username: 'tester-admin', fullName: 'Administrador', role: 'ADMIN', active: true,
      createdAt: timestamp, updatedAt: timestamp
    });
    currentRma = { ...initialRma };
    currentView = { ...initialView, filters: { ...initialView.filters } };
    nextViewId = 6;
    fixture = TestBed.createComponent(KanbanComponent);
    http.expectOne('/api/rmas').flush([currentRma]);
    http.expectOne('/api/users/assignable').flush(assignees);
    http.expectOne('/api/kanban-views').flush([currentView]);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function enter(id: string, value: string): void {
    const input = page.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function selectOption(controlName: string, label: string): void {
    const select = page.querySelector<HTMLElement>('.modal-overlay app-custom-select[formControlName="' + controlName + '"]')!;
    select.querySelector<HTMLButtonElement>('.custom-select__trigger')!.click();
    fixture.detectChanges();
    Array.from(select.querySelectorAll<HTMLButtonElement>('.custom-select__option'))
      .find((option) => option.textContent?.includes(label))!.click();
    fixture.detectChanges();
  }

  function open(mode: Mode, suffix = ''): void {
    if (mode === 'view-create' || mode === 'view-rename') {
      const label = mode === 'view-create' ? 'Salvar atual' : 'Renomear';
      Array.from(page.querySelectorAll<HTMLButtonElement>('.kanban-views button'))
        .find((button) => button.textContent?.trim() === label)!.click();
      fixture.detectChanges();
      expectedViewName = 'Visão ' + mode + suffix;
      enter('kanbanViewName', '  ' + expectedViewName + '  ');
    } else if (mode === 'status') {
      expectedStatus = currentRma.status === 'RECEIVED' ? 'TRIAGE' : 'IN_DIAGNOSIS';
      page.querySelector<HTMLElement>('.board-card')!.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      page.querySelector<HTMLElement>('.board-column[data-status="' + expectedStatus + '"]')!
        .dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      enter('kanbanStatusNote', '  Nota  ');
    } else {
      page.querySelector<HTMLButtonElement>('.board-card__assignee-action')!.click();
      fixture.detectChanges();
      expectedAssignee = currentRma.assigneeId === 7 ? 8 : 7;
      selectOption('assigneeId', assignees.find((user) => user.id === expectedAssignee)!.fullName);
    }
  }

  function match(mode: Mode): { method: string; url: string } {
    if (mode === 'view-create') return { method: 'POST', url: '/api/kanban-views' };
    if (mode === 'view-rename') return { method: 'PUT', url: '/api/kanban-views/' + currentView.id };
    return { method: 'PATCH', url: '/api/rmas/1/' + (mode === 'status' ? 'status' : 'assignee') };
  }

  function submitButton(): HTMLButtonElement {
    return page.querySelector<HTMLButtonElement>('.modal-overlay button[type="submit"]')!;
  }

  function submit(): void {
    page.querySelector('.modal-overlay form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function succeed(request: TestRequest, mode: Mode): void {
    if (mode === 'view-create' || mode === 'view-rename') {
      expect(request.request.body).toEqual({
        name: expectedViewName, defaultView: mode === 'view-rename' ? currentView.defaultView : false,
        filters: initialView.filters
      });
      currentView = { ...currentView, ...request.request.body, id: mode === 'view-create' ? nextViewId++ : currentView.id };
      request.flush(currentView);
      fixture.detectChanges();
      expect(page.querySelector('.kanban-views__controls .custom-select__label')?.textContent).toContain(currentView.name);
    } else {
      if (mode === 'status') {
        expect(request.request.body).toEqual({ status: expectedStatus, note: 'Nota' });
        currentRma = { ...currentRma, status: expectedStatus, statusHistory: [
          { status: expectedStatus, changedBy: 'tester-admin', changedAt: timestamp, note: 'Nota' }, ...currentRma.statusHistory
        ] };
      } else {
        expect(request.request.body).toEqual({ assigneeId: expectedAssignee });
        const newName = assignees.find((user) => user.id === expectedAssignee)?.fullName ?? null;
        currentRma = { ...currentRma, assigneeId: expectedAssignee, assigneeName: newName, assignmentHistory: [
          { previousAssigneeId: currentRma.assigneeId, previousAssigneeName: currentRma.assigneeName,
            newAssigneeId: expectedAssignee, newAssigneeName: newName, changedBy: 'tester-admin', changedAt: timestamp },
          ...currentRma.assignmentHistory
        ] };
      }
      request.flush(currentRma);
      http.expectOne('/api/rmas').flush([currentRma]);
      http.expectOne('/api/users/assignable').flush(assignees);
      fixture.detectChanges();
      expect(page.querySelector('.board-column[data-status="' + currentRma.status + '"] .board-card')?.textContent).toContain(currentRma.code);
    }
    expect(page.querySelector('.modal-overlay')).toBeNull();
  }

  it.each(modes)('ignores repeated %s submissions while the first request is pending', (mode) => {
    open(mode);
    submit();
    const first = http.expectOne(match(mode));
    expect(submitButton().disabled).toBe(true);
    submit();
    const duplicates = http.match(match(mode));
    for (const duplicate of duplicates) {
      duplicate.flush({ message: 'Duplicate request' }, { status: 500, statusText: 'Server Error' });
    }
    if (duplicates.length) {
      first.flush({ message: 'Pending request cleanup' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
    }
    expect(duplicates).toHaveLength(0);
    expect(first.cancelled).toBe(false);
    expect(submitButton().disabled).toBe(true);
    succeed(first, mode);
  });

  it.each(modes)('allows a manual %s retry after an error without losing the payload', (mode) => {
    open(mode);
    submit();
    const first = http.expectOne(match(mode));
    const payload = first.request.body;
    first.flush({ message: 'Falha temporária' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(submitButton().disabled).toBe(false);
    expect(page.querySelector('.modal-overlay')).not.toBeNull();
    expect(page.textContent).toContain('Falha temporária');
    submit();
    const retry = http.expectOne(match(mode));
    expect(retry.request.body).toEqual(payload);
    succeed(retry, mode);
  });

  it.each(modes)('allows a new %s operation after a successful one', (mode) => {
    open(mode);
    submit();
    succeed(http.expectOne(match(mode)), mode);
    open(mode, '-next');
    expect(submitButton().disabled).toBe(false);
    submit();
    succeed(http.expectOne(match(mode)), mode);
  });

  it.each(['view-create', 'view-rename'] as const)('does not send or lock %s with an empty name', (mode) => {
    open(mode);
    enter('kanbanViewName', '');
    submit();
    http.expectNone(match(mode));
    expect(submitButton().disabled).toBe(false);
    expect(page.querySelector('.modal-overlay')).not.toBeNull();
  });

  it('keeps rejecting a status equal to the current one without locking the form', () => {
    open('status');
    selectOption('status', RMA_STATUS_LABELS[currentRma.status]);
    submit();
    http.expectNone(match('status'));
    expect(submitButton().disabled).toBe(false);
    expect(page.textContent).toContain('Escolha uma fase diferente da atual.');
  });

  it('continues allowing the assignee to be cleared', () => {
    open('assignment');
    selectOption('assigneeId', 'Sem responsável');
    expectedAssignee = null;
    submit();
    succeed(http.expectOne(match('assignment')), 'assignment');
    expect(page.querySelector('.board-card__grid')?.textContent).toContain('Sem responsável');
  });
});
