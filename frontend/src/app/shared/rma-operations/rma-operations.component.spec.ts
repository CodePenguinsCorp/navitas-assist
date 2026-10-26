import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { OperationsService } from '../../core/services/operations.service';
import { RmaService } from '../../core/services/rma.service';
import { RmaOperationsComponent } from './rma-operations.component';
import { RmaResponse, RmaApproval, RmaChecklistExecution } from '../../core/models';
describe('RMA operational evidence', () => {
  let fixture: any;
  let c: RmaOperationsComponent;
  let viewer: boolean;
  let refreshed: number;
  let submitted: any;
  let fail: boolean;
  let failRefresh: boolean;
  let requests: number;
  beforeEach(() => {
    viewer = false;
    refreshed = 0;
    submitted = null;
    fail = false;
    failRefresh = false;
    requests = 0;
    TestBed.configureTestingModule({
      imports: [RmaOperationsComponent],
      providers: [
        {
          provide: AuthService,
          useValue: { hasAnyRole: (roles: string[]) => !viewer && roles.includes('TECHNICIAN') },
        },
        {
          provide: RmaService,
          useValue: {
            getById: () => {
              refreshed++;
              if (failRefresh) return throwError(() => ({ error: { message: 'Consulta indisponível' } }));
              return of({ id: 1, status: 'NEW', transitionOptions: [] } as unknown as RmaResponse);
            },
          },
        },
        {
          provide: OperationsService,
          useValue: {
            templates: () => of([]),
            executions: () => of([]),
            approvals: () => of([]),
            request: (_id: number, body: any) => {
              requests++;
              submitted = body;
              return fail ? throwError(() => ({ error: { message: 'Falha ao salvar' } })) : of({});
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(RmaOperationsComponent);
    fixture.componentRef.setInput('rma', { id: 1, updatedAt: 'now' });
    fixture.detectChanges();
    c = fixture.componentInstance;
  });
  it('refreshes authoritative transition options after requesting approval', () => {
    c.approvalCode = 'REPAIR';
    c.justification = 'Necessário';
    c.requestApproval();
    expect(submitted).toEqual({ code: 'REPAIR', justification: 'Necessário' });
    expect(refreshed).toBe(1);
  });
  it('preserves request input and exposes failed persistence', () => {
    fail = true;
    c.approvalCode = 'REPAIR';
    c.justification = 'Necessário';
    c.requestApproval();
    expect(c.justification).toBe('Necessário');
    expect(c.error()).toContain('Falha');
    expect(refreshed).toBe(0);
  });
  it('acknowledges a persisted request when its refresh fails and blocks duplicate writes', () => {
    failRefresh = true;
    c.approvalCode = 'REPAIR';
    c.justification = 'Necessário';
    c.requestApproval();
    expect(c.justification).toBe('');
    expect(c.message()).toContain('registrada');
    expect(c.error()).toContain('consulta');
    c.justification = 'Outra';
    c.requestApproval();
    expect(requests).toBe(1);
    expect(c.needsRefresh()).toBe(true);
    failRefresh = false;
    c.refresh();
    expect(requests).toBe(1);
    expect(refreshed).toBe(2);
    expect(c.needsRefresh()).toBe(false);
    expect(c.error()).toBe('');
  });
  it('exposes viewer read access without writes', () => {
    viewer = true;
    c.approvalCode = 'REPAIR';
    c.justification = 'Necessário';
    c.requestApproval();
    expect(submitted).toBeNull();
  });
  it('does not allow a technician to decide approvals', () => {
    expect(c.canDecide()).toBe(false);
  });
  it('treats a newer request as superseding an older pending request', () => {
    const old = { id: 1, code: 'REPAIR', status: 'PENDING' } as RmaApproval;
    const latest = { ...old, id: 2 };
    c.approvals.set([old, latest]);
    expect(c.isLatest(old)).toBe(false);
    expect(c.isLatest(latest)).toBe(true);
  });
  it('ignores a previous RMA load that finishes after the current selection', () => {
    const previous = new Subject<RmaChecklistExecution[]>();
    const current = new Subject<RmaChecklistExecution[]>();
    vi.spyOn(TestBed.inject(OperationsService), 'executions').mockImplementation((id) =>
      id === 1 ? previous : current,
    );
    fixture.componentRef.setInput('rma', { id: 1, updatedAt: 'later' });
    fixture.detectChanges();
    fixture.componentRef.setInput('rma', { id: 2, updatedAt: 'later' });
    fixture.detectChanges();
    current.next([{ id: 2 } as RmaChecklistExecution]);
    current.complete();
    previous.next([{ id: 1 } as RmaChecklistExecution]);
    previous.complete();
    expect(c.executions().map((execution) => execution.id)).toEqual([2]);
  });
});
