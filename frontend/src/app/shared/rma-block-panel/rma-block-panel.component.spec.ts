import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmaBlockPanelComponent } from './rma-block-panel.component';

describe('RmaBlockPanelComponent', () => {
  let fixture: ComponentFixture<RmaBlockPanelComponent>;
  let http: HttpTestingController;
  let writable: boolean;

  beforeEach(async () => {
    writable = true;
    await TestBed.configureTestingModule({ imports: [RmaBlockPanelComponent], providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { hasAnyRole: () => writable } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(RmaBlockPanelComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function load(rma = RMA) {
    fixture.componentInstance.open(rma.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Carregando');
    http.expectOne('/api/rmas/1').flush(rma);
    fixture.detectChanges();
  }

  it('shows load failure inside the dialog and retries the selected RMA', () => {
    fixture.componentInstance.open(1);
    http.expectOne('/api/rmas/1').flush({}, { status: 500, statusText: 'Failure' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    fixture.nativeElement.querySelector('[data-retry]').click();
    http.expectOne('/api/rmas/1').flush(RMA);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('RMA-2026-000001');
  });

  it('requires a trimmed reason and preserves input when the server refuses', () => {
    load();
    const reason: HTMLTextAreaElement = fixture.nativeElement.querySelector('[formControlName="reason"]');
    reason.value = '   ';
    reason.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    http.expectNone('/api/rmas/1/blocks');
    reason.value = '  Peça pendente  ';
    reason.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    const request = http.expectOne('/api/rmas/1/blocks');
    expect(request.request.body).toEqual({ reason: 'Peça pendente', category: null });
    request.flush({ message: 'RMA is already blocked.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog [role="alert"]')).not.toBeNull();
    expect(reason.value).toBe('  Peça pendente  ');
  });

  it('shows current and resolved history to VIEWER without mutation controls', () => {
    writable = false;
    load({ ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK, { ...BLOCK, id: 8, reason: 'Bloqueio anterior', resolvedBy: 'desk', resolvedAt: '2026-10-20T12:00:00Z', resolutionNote: 'Resolvido anteriormente' }] });
    expect(fixture.nativeElement.textContent).toContain('Peça pendente');
    expect(fixture.nativeElement.textContent).toContain('Resolvido anteriormente');
    expect(fixture.nativeElement.textContent).toContain('20/10/2026, 07:00');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('requires a resolution note, resolves the loaded episode and emits updated state', () => {
    load({ ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] });
    const updated: RmaResponse[] = [];
    fixture.componentInstance.updated.subscribe((rma) => updated.push(rma));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    http.expectNone('/api/rmas/1/blocks/9');
    const note = fixture.nativeElement.querySelector('[formControlName="resolutionNote"]');
    note.value = 'Peça recebida';
    note.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    const request = http.expectOne('/api/rmas/1/blocks/9');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ resolutionNote: 'Peça recebida' });
    request.flush({ ...RMA, blockHistory: [{ ...BLOCK, resolvedBy: 'desk', resolvedAt: '2026-10-20T12:00:00Z', resolutionNote: 'Peça recebida' }] });
    fixture.detectChanges();
    expect(updated[0].currentBlock).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Peça recebida');
  });

  it('rejects oversized fields and keeps the dialog open during a pending write', () => {
    load();
    const reason = fixture.nativeElement.querySelector('[formControlName="reason"]');
    const category = fixture.nativeElement.querySelector('[formControlName="category"]');
    reason.value = 'x'.repeat(1001);
    reason.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    http.expectNone('/api/rmas/1/blocks');
    reason.value = 'Valid';
    reason.dispatchEvent(new Event('input'));
    category.value = 'x'.repeat(81);
    category.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    http.expectNone('/api/rmas/1/blocks');
    category.value = '';
    category.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    const request = http.expectOne('/api/rmas/1/blocks');
    fixture.detectChanges();
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(true);
    expect(reason.disabled).toBe(true);
    request.flush({ ...RMA, currentBlock: BLOCK, blockHistory: [BLOCK] });
    fixture.detectChanges();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(false);
  });

  it('cancels a previous read when another card is inspected', () => {
    fixture.componentInstance.open(1);
    const old = http.expectOne('/api/rmas/1');
    fixture.componentInstance.open(2);
    expect(old.cancelled).toBe(true);
    http.expectOne('/api/rmas/2').flush({ ...RMA, id: 2, code: 'RMA-2' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('RMA-2');
    expect(fixture.nativeElement.textContent).not.toContain('RMA-2026-000001');
  });
});

const BLOCK = { id: 9, reason: 'Peça pendente', category: 'Peças', blockedBy: 'tech', blockedAt: '2026-10-20T10:00:00Z', resolvedBy: null, resolvedAt: null, resolutionNote: null };
const RMA: RmaResponse = {
  id: 1, code: 'RMA-2026-000001', clientId: 1, clientName: 'Cliente', items: [], productId: 1, productName: 'Produto', productSku: 'P1', batchNumber: 'L1', serialNumber: null, manufacturedAt: null,
  purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-10-20', invoiceNumber: null, receivedBy: 'desk', reportedFailure: 'Falha', receivedAccessories: null, physicalCondition: null,
  priority: 'MEDIUM', status: 'TRIAGE', sla: { status: 'NORMAL', startedAt: '2026-10-20T10:00:00Z', warningAt: null, dueAt: null, elapsedSeconds: 0, limitSeconds: null },
  assigneeId: null, assigneeName: null, repairSummary: null, replacedPartsSummary: null, testSummary: null, shippedAt: null, carrier: null, trackingCode: null, diagnosis: null, statusHistory: [], assignmentHistory: [],
  currentBlock: null, blockHistory: [], createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z',
};
