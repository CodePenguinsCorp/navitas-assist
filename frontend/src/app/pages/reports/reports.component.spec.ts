import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RmaReportPageResponse, RmaReportSummaryResponse, WarrantyStatus } from '../../core/models';
import { providePermissions } from '../../testing/permission-fixtures';
import { ReportsComponent } from './reports.component';

const SUMMARY: RmaReportSummaryResponse = {
  generatedAt: '2026-10-21T01:00:00Z', entryFrom: '2026-07-24', entryTo: '2026-10-21', totalRmas: 4, totalItems: 5,
  byStatus: [{ key: 'RECEIVED', label: 'Recebido', count: 3 }, { key: 'RETURNED', label: 'Devolvido', count: 1 }],
  byWarranty: [{ key: 'IN_WARRANTY', label: 'Em garantia', count: 4 }, { key: 'OUT_OF_WARRANTY', label: 'Fora de garantia', count: 1 },
    { key: 'PENDING', label: 'Pendente', count: 0 }],
  byMonth: [{ key: '2026-09', label: '09/2026', count: 1 }, { key: '2026-10', label: '10/2026', count: 3 }],
  topProducts: [{ key: '3', label: 'Controlador (SKU-1)', count: 4 }], topBatches: [{ key: '3|L1', label: 'L1 · Controlador (SKU-1)', count: 2 }],
  topClients: [{ key: '2', label: 'Cliente Alfa', count: 4 }], topFailureTypes: [{ key: 'SENSOR', label: 'Sensor', count: 2 }],
  recurrence: { itemsWithSerial: 4, returnedItems: 1, byProduct: [{ key: '3', label: 'Controlador (SKU-1)', items: 4, returnedItems: 1 }],
    byBatch: [], serials: [{ serialNumber: 'SER-A', productName: 'Controlador', productSku: 'SKU-1', rmaCount: 2 }] },
  stages: [{ status: 'RECEIVED', label: 'Recebido', count: 3, averageSeconds: 7200, maximumSeconds: 90000 }]
};

const PAGE: RmaReportPageResponse = {
  generatedAt: '2026-10-21T01:00:00Z', entryFrom: '2026-07-24', entryTo: '2026-10-21',
  rmas: { content: [{ id: 1, code: 'RMA-REAL', entryDate: '2026-10-20', status: 'RECEIVED', clientName: 'Cliente Alfa', productName: 'Controlador',
    productSku: 'SKU-1', serialNumber: 'SER-A', batchNumber: null, itemCount: 2, warrantyStatuses: [WarrantyStatus.IN_WARRANTY, WarrantyStatus.OUT_OF_WARRANTY],
    failureType: 'SENSOR' }], page: 0, size: 20, totalElements: 21, totalPages: 2 }
};

interface Harness {
  form: ReportsComponent['form'];
  consult(): void;
  selectTab(tab: string): void;
}

describe('ReportsComponent', () => {
  let fixture: ComponentFixture<ReportsComponent>;
  let component: Harness;
  let http: HttpTestingController;
  const text = () => (fixture.nativeElement as HTMLElement).textContent as string;
  const summaryRequest = () => http.expectOne((request) => request.url === '/api/reports/rmas/summary');
  const listRequest = () => http.expectOne((request) => request.url === '/api/reports/rmas');
  const respond = () => {
    summaryRequest().flush(SUMMARY);
    listRequest().flush(PAGE);
    fixture.detectChanges();
  };
  const show = (tab: string) => {
    component.selectTab(tab);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), providePermissions(['relatorios.ver', 'rma.ver'])]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance as unknown as Harness;
    fixture.detectChanges();
    http.expectOne('/api/clients/options').flush([{ id: 2, legalName: 'Cliente Alfa' }]);
  });

  afterEach(() => http.verify());

  it('starts with the last 90 days, loads summary and first page together and blocks long periods', () => {
    const summary = summaryRequest();
    const list = listRequest();
    const from = summary.request.params.get('entryFrom') as string;
    const to = summary.request.params.get('entryTo') as string;
    expect((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000).toBe(89);
    expect(list.request.params.get('page')).toBe('0');
    expect(list.request.params.get('size')).toBe('20');
    summary.flush(SUMMARY);
    list.flush(PAGE);

    component.form.patchValue({ entryFrom: '2025-01-01', entryTo: '2026-01-02' });
    component.consult();
    fixture.detectChanges();
    http.expectNone((request) => request.url.startsWith('/api/reports/'));
    expect(text()).toContain('no máximo 366 dias');
  });

  it('shows the summary with shares, months and stage times', () => {
    respond();
    expect(text()).toContain('4 RMAs');
    expect(text()).toContain('5 itens');
    expect(text()).toContain('Recebido');
    expect(text()).toContain('75,0%');
    expect(text()).toContain('Em garantia');
    expect(text()).toContain('80,0%');
    expect(text()).toContain('10/2026');
    expect(text()).toContain('2 h');
    expect(text()).toContain('1 d 1 h');
  });

  it('shows the failure rankings and the recurrence', () => {
    respond();
    show('failures');
    expect(text()).toContain('L1 · Controlador (SKU-1)');
    expect(text()).toContain('Sensor');
    show('recurrence');
    expect(text()).toContain('1 de 4 itens com série retornaram (25,0%)');
    expect(text()).toContain('SER-A');
    expect(text()).toContain('Nenhum lote com retorno');
  });

  it('pages the RMA list on the server and links the PDF report', () => {
    respond();
    show('rmas');
    expect(text()).toContain('RMA-REAL');
    expect(text()).toContain('Controlador +1');
    expect(text()).toContain('Em garantia, Fora de garantia');
    expect(text()).toContain('1–1 de 21');
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-label="Baixar laudo de RMA-REAL"]')).not.toBeNull();
    const next = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((button) => button.textContent?.includes('Próxima'));
    next?.click();
    const request: TestRequest = listRequest();
    expect(request.request.params.get('page')).toBe('1');
    request.flush({ ...PAGE, rmas: { ...PAGE.rmas, content: [], page: 1 } });
    fixture.detectChanges();
    expect(text()).toContain('Nenhum RMA encontrado.');
  });

  it('exports the CSV of the current tab with the applied filters', () => {
    respond();
    const exportButton = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-export]');
    exportButton()?.click();
    const summary = http.expectOne((request) => request.url === '/api/reports/rmas/summary/export.csv');
    expect(summary.request.params.get('entryFrom')).toBeTruthy();
    summary.flush(new Blob(['x']));
    show('rmas');
    exportButton()?.click();
    http.expectOne((request) => request.url === '/api/reports/rmas/export.csv').flush(new Blob(['x']));
  });

  it('keeps the error visible with a retry when the report fails', () => {
    summaryRequest().flush({ message: 'erro' }, { status: 500, statusText: 'Erro' });
    listRequest().flush(PAGE);
    fixture.detectChanges();
    expect(text()).toContain('Não foi possível carregar os relatórios.');
  });
});
