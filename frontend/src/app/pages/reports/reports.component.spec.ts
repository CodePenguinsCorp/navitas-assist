import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RmaReportPageResponse, RmaReportSummaryResponse, WarrantyStatus } from '../../core/models';
import { providePermissions } from '../../testing/permission-fixtures';
import { ReportsComponent } from './reports.component';

const SUMMARY: RmaReportSummaryResponse = {
  generatedAt: '2026-10-21T01:00:00Z', entryFrom: '2026-07-24', entryTo: '2026-10-21', totalRmas: 4, totalItems: 5,
  byStatus: [{ key: 'RECEIVED', label: 'Recebida', count: 3 }, { key: 'RETURNED', label: 'Devolvida', count: 1 }],
  byWarranty: [{ key: 'IN_WARRANTY', label: 'Em garantia', count: 4 }, { key: 'OUT_OF_WARRANTY', label: 'Fora de garantia', count: 1 },
    { key: 'PENDING', label: 'Pendente', count: 0 }],
  byMonth: [{ key: '2026-09', label: '09/2026', count: 1 }, { key: '2026-10', label: '10/2026', count: 3 }],
  topProducts: [{ key: '3', label: 'Controlador (SKU-1)', count: 4 }], topBatches: [{ key: '3|L1', label: 'L1 · Controlador (SKU-1)', count: 2 }],
  topClients: [{ key: '2', label: 'Cliente Alfa', count: 4 }], topFailureTypes: [{ key: 'SENSOR', label: 'Sensor', count: 2 }],
  recurrence: { itemsWithSerial: 4, returnedItems: 1, byProduct: [{ key: '3', label: 'Controlador (SKU-1)', items: 4, returnedItems: 1 }],
    byBatch: [], serials: [{ serialNumber: 'SER-A', productName: 'Controlador', productSku: 'SKU-1', rmaCount: 2 }] },
  stages: [{ status: 'RECEIVED', label: 'Recebida', count: 3, averageSeconds: 7200, maximumSeconds: 90000 }]
};

const PAGE: RmaReportPageResponse = {
  generatedAt: '2026-10-21T01:00:00Z', entryFrom: '2026-07-24', entryTo: '2026-10-21',
  rmas: { content: [{ id: 1, code: 'OS-REAL', entryDate: '2026-10-20', status: 'RECEIVED', clientName: 'Cliente Alfa', productName: 'Controlador',
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

  it('draws warranty as a donut with the item total instead of a table', () => {
    respond();
    const root = fixture.nativeElement as HTMLElement;
    const donut = root.querySelector('app-donut-chart') as HTMLElement;
    expect(donut).not.toBeNull();
    expect(donut.querySelector('.donut__value')?.textContent).toBe('5');
    const row = Array.from(donut.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Em garantia')) as Element;
    expect(Array.from(row.children).map((cell) => cell.textContent?.trim())).toEqual(['Em garantia', '4', '80,0%']);
    expect(root.querySelectorAll('app-bar-chart').length).toBe(2);
    expect(Array.from(root.querySelectorAll('th')).some((cell) => cell.textContent?.trim() === 'Situação' && !donut.contains(cell))).toBe(false);
  });

  it('shows the summary with shares, months and stage times', () => {
    respond();
    expect(text()).toContain('4 ordens de serviço');
    expect(text()).toContain('5 itens');
    expect(text()).toContain('Recebida');
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
    const indicators = (fixture.nativeElement as HTMLElement).querySelector('.page-summary')!.textContent!;
    expect(indicators).toContain('Retornaram');
    expect(indicators).toContain('1 de 4');
    expect(indicators).toContain('itens com série (25,0%)');
    expect(text()).toContain('SER-A');
    expect(text()).toContain('Nenhum lote com retorno');
  });

  it('pages the OS list on the server and links the PDF report', () => {
    respond();
    show('rmas');
    expect(text()).toContain('OS-REAL');
    expect(text()).toContain('Controlador +1');
    expect(text()).toContain('Em garantia, Fora de garantia');
    expect(text()).toContain('1–1 de 21');
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-label="Baixar laudo de OS-REAL"]')).not.toBeNull();
    const next = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((button) => button.textContent?.includes('Próxima'));
    next?.click();
    const request: TestRequest = listRequest();
    expect(request.request.params.get('page')).toBe('1');
    request.flush({ ...PAGE, rmas: { ...PAGE.rmas, content: [], page: 1 } });
    fixture.detectChanges();
    expect(text()).toContain('Nenhuma OS encontrada.');
  });

  it('exports the CSV of the current tab with the applied filters', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    respond();
    const exportButton = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-export]');
    exportButton()?.click();
    const summary = http.expectOne((request) => request.url === '/api/reports/rmas/summary/export.csv');
    expect(summary.request.params.get('entryFrom')).toBeTruthy();
    summary.flush(new Blob(['x']));
    show('rmas');
    exportButton()?.click();
    http.expectOne((request) => request.url === '/api/reports/rmas/export.csv').flush(new Blob(['x']));
    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });

  it('shows the period totals in the indicator strip', () => {
    respond();
    const indicators = (fixture.nativeElement as HTMLElement).querySelector('.page-summary')!.textContent!.replace(/\s+/g, ' ');
    expect(indicators).toContain('24/07/2026 a 21/10/2026');
    expect(indicators).toContain('4 ordens de serviço');
    expect(indicators).toContain('5 itens');
    expect(indicators).not.toContain('Retornaram');
  });

  it('hides the previous page while a new consultation loads or fails', () => {
    respond();
    show('rmas');
    expect(text()).toContain('OS-REAL');
    component.form.patchValue({ status: 'RETURNED' });
    component.consult();
    fixture.detectChanges();
    expect(text()).not.toContain('OS-REAL');
    expect((fixture.nativeElement as HTMLElement).querySelector('#report-panel [aria-busy="true"]')).not.toBeNull();
    summaryRequest().flush({ message: 'erro' }, { status: 500, statusText: 'Erro' });
    listRequest().flush({ message: 'erro' }, { status: 500, statusText: 'Erro' });
    fixture.detectChanges();
    expect(text()).not.toContain('OS-REAL');
    expect(text()).toContain('Não foi possível carregar os relatórios.');
  });

  it('clears the filters back to the last 90 days and consults again', () => {
    respond();
    component.form.patchValue({ entryFrom: '2026-01-01', status: 'RETURNED', clientId: 2 });
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Limpar filtros')!.click();
    const summary = summaryRequest();
    const from = summary.request.params.get('entryFrom') as string;
    const to = summary.request.params.get('entryTo') as string;
    expect((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000).toBe(89);
    expect(summary.request.params.has('status')).toBe(false);
    expect(summary.request.params.has('clientId')).toBe(false);
    summary.flush(SUMMARY);
    listRequest().flush(PAGE);
  });

  it('shows the backend message of a failed CSV export, with a generic fallback', async () => {
    respond();
    const exportButton = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-export]')!;
    exportButton().click();
    http.expectOne((request) => request.url === '/api/reports/rmas/summary/export.csv')
      .flush(new Blob([JSON.stringify({ message: 'A exportação está limitada a 5.000 linhas.' })], { type: 'application/json' }), { status: 400, statusText: 'Bad Request' });
    await vi.waitFor(() => { fixture.detectChanges(); expect(text()).toContain('A exportação está limitada a 5.000 linhas.'); });

    exportButton().click();
    http.expectOne((request) => request.url === '/api/reports/rmas/summary/export.csv')
      .flush(new Blob(['<html>erro</html>'], { type: 'text/html' }), { status: 502, statusText: 'Bad Gateway' });
    await vi.waitFor(() => { fixture.detectChanges(); expect(text()).toContain('Não foi possível exportar o CSV. Reduza o período ou os filtros e tente novamente.'); });
  });

  it('keeps the error visible with a retry when the report fails', () => {
    summaryRequest().flush({ message: 'erro' }, { status: 500, statusText: 'Erro' });
    listRequest().flush(PAGE);
    fixture.detectChanges();
    expect(text()).toContain('Não foi possível carregar os relatórios.');
  });
});
