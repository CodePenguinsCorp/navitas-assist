import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { RmaResponse, WarrantyStatus } from '../../core/models';
import { ReportsComponent } from './reports.component';

const RMA: RmaResponse = {
  id: 1, code: 'RMA-REAL', clientId: 2, clientName: 'Cliente Alfa',
  items: [
    { id: 11, productId: 3, productName: 'Controlador', productSku: 'SKU-1', batchNumber: 'LOTE-A', serialNumber: 'SER-A',
      manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: '2026-10-20', warrantyStatus: WarrantyStatus.IN_WARRANTY },
    { id: 12, productId: 3, productName: 'Controlador', productSku: 'SKU-1', batchNumber: 'LOTE-B', serialNumber: 'SER-B',
      manufacturedAt: null, warrantyMonths: 6, warrantyExpiresAt: '2026-04-20', warrantyStatus: WarrantyStatus.OUT_OF_WARRANTY }
  ],
  productId: 3, productName: 'Controlador', productSku: 'SKU-1', batchNumber: 'LOTE-A', serialNumber: 'SER-A', manufacturedAt: null,
  purchaseDate: '2025-10-20', purchaseDateUnknown: false, entryDate: '2026-10-20', invoiceNumber: 'NF-1', receivedBy: 'admin',
  reportedFailure: 'Não liga', receivedAccessories: null, physicalCondition: null, priority: 'HIGH', status: 'IN_DIAGNOSIS',
  sla: { status: 'NORMAL', startedAt: '2026-10-20T12:00:00Z', warningAt: '2026-10-22T02:24:00Z',
    dueAt: '2026-10-22T12:00:00Z', elapsedSeconds: 7200, limitSeconds: 172800 },
  assigneeId: null, assigneeName: null, repairSummary: 'Conector substituído', replacedPartsSummary: 'Conector USB',
  testSummary: 'Teste aprovado', shippedAt: null, carrier: null, trackingCode: null,
  diagnosis: { id: 1, foundFailure: 'Conector danificado', failureType: 'COMMUNICATION', probableCause: 'INCORRECT_USAGE',
    notes: 'Inspeção visual', diagnosedAt: '2026-10-20', technicianName: 'Técnico Alfa',
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' },
  statusHistory: [], assignmentHistory: [], createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
};

describe('ReportsComponent', () => {
  let fixture: ComponentFixture<ReportsComponent>;
  let component: ReportsHarness;
  let http: HttpTestingController;
  const text = () => fixture.nativeElement.textContent as string;
  const respond = (rmas: RmaResponse[] = [RMA]) => {
    http.expectOne((request) => request.url === '/api/reports/rmas').flush({ generatedAt: '2026-10-21T01:00:00Z', rmas });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsComponent], providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance as unknown as ReportsHarness;
    fixture.detectChanges();
    http.expectOne('/api/clients').flush([{ id: 2, legalName: 'Cliente Alfa', tradeName: null, documentNumber: null,
      contactName: null, email: null, phone: null, address: null, notes: null,
      createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' }]);
  });

  afterEach(() => http.verify());

  it('loads real technical details and formats civil dates and the snapshot in Sao Paulo', () => {
    expect(text()).toContain('Carregando relatórios');
    respond();
    expect(text()).toContain('RMA-REAL');
    expect(text()).toContain('Conector danificado');
    expect(text()).toContain('Conector substituído');
    expect(text()).toContain('Conector USB');
    expect(text()).toContain('Teste aprovado');
    expect(text()).toContain('Técnico Alfa');
    expect(text()).toContain('20/10/2026');
    expect(text()).toContain('22:00');
  });

  it('shows every warranty item and distinguishes a pending diagnosis', () => {
    respond([{ ...RMA, diagnosis: null }]);
    expect(text()).toContain('Diagnóstico pendente');
    component.form.patchValue({ report: 'warranty' });
    fixture.detectChanges();
    expect(text()).toContain('SER-A');
    expect(text()).toContain('SER-B');
    expect(text()).toContain('Em garantia');
    expect(text()).toContain('Fora de garantia');
    expect(text()).toContain('20/04/2026');
    expect(text()).toContain('sem override manual');
  });

  it('groups current-stage aging and excludes closed records from active metrics', () => {
    respond([RMA, { ...RMA, id: 2, code: 'RMA-SECOND', sla: { ...RMA.sla, elapsedSeconds: 14400 } },
      { ...RMA, id: 3, code: 'RMA-CLOSED', status: 'COMPLETED', sla: { ...RMA.sla, status: 'CLOSED', elapsedSeconds: 0 } }]);
    component.form.patchValue({ report: 'aging' });
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('[data-stage="IN_DIAGNOSIS"]');
    expect(row.textContent).toContain('2');
    expect(row.textContent).toContain('3h 0min');
    expect(row.textContent).toContain('4h 0min');
    expect(text()).not.toContain('RMA-CLOSED');
  });

  it('shows shipping only for currently returned RMAs', () => {
    respond([RMA, { ...RMA, id: 2, code: 'RMA-RETURN', status: 'RETURNED', shippedAt: '2026-10-21',
      carrier: 'Transportadora Alfa', trackingCode: 'TRACK-123', sla: { ...RMA.sla, status: 'CLOSED', elapsedSeconds: 0 } }]);
    component.form.patchValue({ report: 'returns' });
    fixture.detectChanges();
    expect(text()).toContain('RMA-RETURN');
    expect(text()).toContain('21/10/2026');
    expect(text()).toContain('TRACK-123');
    expect(text()).toContain('Transportadora Alfa');
    expect(text()).not.toContain('RMA-REAL');
  });

  it('combines filters in the HTTP query and rejects a reversed interval without displaying stale results', () => {
    respond();
    component.form.patchValue({ entryFrom: '2026-10-01', entryTo: '2026-10-20', status: 'IN_DIAGNOSIS', clientId: 2 });
    component.loadReports();
    const request = http.expectOne((candidate) => candidate.url === '/api/reports/rmas');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('entryFrom')).toBe('2026-10-01');
    expect(request.request.params.get('entryTo')).toBe('2026-10-20');
    expect(request.request.params.get('status')).toBe('IN_DIAGNOSIS');
    expect(request.request.params.get('clientId')).toBe('2');
    request.flush({ generatedAt: '2026-10-21T01:00:00Z', rmas: [RMA] });
    component.form.patchValue({ entryFrom: '2026-10-21' });
    component.loadReports();
    fixture.detectChanges();
    expect(text()).toContain('data inicial');
    expect(text()).not.toContain('RMA-REAL');
    http.expectNone((candidate) => candidate.url === '/api/reports/rmas');
  });

  it('handles an empty report and a failed refresh with a working retry', () => {
    respond([]);
    expect(text()).toContain('Nenhum RMA encontrado');
    component.loadReports();
    respond();
    component.loadReports();
    http.expectOne((candidate) => candidate.url === '/api/reports/rmas').flush({}, { status: 500, statusText: 'Server error' });
    fixture.detectChanges();
    expect(text()).toContain('Não foi possível carregar os relatórios');
    expect(text()).not.toContain('RMA-REAL');
    const retry = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.includes('Tentar novamente'))!;
    retry.click();
    respond();
    expect(text()).toContain('RMA-REAL');
  });

  it('cancels an older query so its response cannot overwrite newer filters', () => {
    const oldRequest = http.expectOne((request) => request.url === '/api/reports/rmas');
    component.form.patchValue({ status: 'RETURNED' });
    component.loadReports();
    expect(oldRequest.cancelled).toBe(true);
    const current = http.expectOne((request) => request.url === '/api/reports/rmas');
    expect(current.request.params.get('status')).toBe('RETURNED');
    current.flush({ generatedAt: '2026-10-21T01:00:00Z', rmas: [] });
    fixture.detectChanges();
    expect(text()).toContain('Nenhum RMA encontrado');
  });

  it('keeps report access available when the client selector fails and allows retrying it', () => {
    respond();
    component.loadClients();
    http.expectOne('/api/clients').flush({}, { status: 500, statusText: 'Server error' });
    fixture.detectChanges();
    expect(text()).toContain('Não foi possível carregar os clientes');
    expect(text()).toContain('RMA-REAL');
    const retry = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.includes('Recarregar clientes'))!;
    retry.click();
    http.expectOne('/api/clients').flush([]);
    fixture.detectChanges();
    expect(text()).not.toContain('Não foi possível carregar os clientes');
  });
});

interface ReportsHarness {
  form: FormGroup;
  loadReports(): void;
  loadClients(): void;
}
