import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { FAILURE_CAUSE_LABELS } from '../../core/mock-data';
import { RmaResponse, WarrantyStatus } from '../../core/models';
import { ReportsComponent } from './reports.component';

const RMA: RmaResponse = {
  id: 1, code: 'RMA-REAL', clientId: 2, clientName: 'Cliente Alfa',
  items: [
    { id: 11, productId: 3, productName: 'Controlador', productSku: 'SKU-1', batchNumber: 'LOTE-A', serialNumber: 'SER-A',
      manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: '2026-10-20', warrantyStatus: WarrantyStatus.IN_WARRANTY }
  ],
  productId: 3, productName: 'Controlador', productSku: 'SKU-1', batchNumber: 'LOTE-A', serialNumber: 'SER-A', manufacturedAt: null,
  purchaseDate: '2025-10-20', purchaseDateUnknown: false, entryDate: '2026-10-20', invoiceNumber: 'NF-1', receivedBy: 'admin',
  reportedFailure: 'Não liga', receivedAccessories: null, physicalCondition: null, priority: 'HIGH', status: 'IN_DIAGNOSIS',
  currentBlock: null, blockHistory: [],
  sla: { status: 'NORMAL', startedAt: '2026-10-20T12:00:00Z', warningAt: '2026-10-22T02:24:00Z',
    dueAt: '2026-10-22T12:00:00Z', elapsedSeconds: 7200, limitSeconds: 172800 },
  assigneeId: null, assigneeName: null, repairSummary: 'Conector substituído', replacedPartsSummary: 'Conector USB',
  testSummary: 'Teste aprovado', shippedAt: null, carrier: null, trackingCode: null,
  diagnosis: { id: 1, foundFailure: 'Conector danificado', failureType: 'COMMUNICATION', probableCause: 'INCORRECT_USAGE',
    notes: 'Inspeção visual', diagnosedAt: '2026-10-20', technicianName: 'Técnico Alfa',
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' },
  statusHistory: [], assignmentHistory: [], createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
};

const REPORTS_URL = '/api/reports/rmas';

describe('ReportsComponent compositions', () => {
  let fixture: ComponentFixture<ReportsComponent>;
  let component: ReportsHarness;
  let http: HttpTestingController;
  const root = () => fixture.nativeElement as HTMLElement;
  const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
  const respond = (rmas: RmaResponse[] = [RMA]) => {
    http.expectOne((request) => request.url === REPORTS_URL)
      .flush({ generatedAt: '2026-10-21T01:00:00Z', entryFrom: '2026-07-24', entryTo: '2026-10-21', rmas });
    fixture.detectChanges();
  };
  const show = (report: string) => {
    component.form.patchValue({ report });
    fixture.detectChanges();
  };
  const panel = () => root().querySelector<HTMLElement>('[role="tabpanel"]')!;
  const headers = (table: Element) => Array.from(table.querySelectorAll('thead th')).map((th) => normalize(th.textContent));
  const cell = (table: Element, row: number, header: string) => {
    const index = headers(table).indexOf(header);
    expect(index, `column ${header}`).toBeGreaterThanOrEqual(0);
    return normalize(table.querySelectorAll('tbody tr')[row]?.querySelectorAll('td')[index]?.textContent);
  };
  const pair = (scope: Element, label: string) => {
    const term = Array.from(scope.querySelectorAll('dt')).find((dt) => normalize(dt.textContent) === label);
    expect(term, `term ${label}`).toBeTruthy();
    return normalize(term!.nextElementSibling?.textContent);
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsComponent], providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance as unknown as ReportsHarness;
    fixture.detectChanges();
    http.expectOne('/api/clients/options').flush([]);
  });

  afterEach(() => http.verify());

  describe('technical report', () => {
    const SECOND: RmaResponse = { ...RMA, id: 2, code: 'RMA-SECOND', clientName: 'Cliente Beta', diagnosis: null,
      items: [{ ...RMA.items[0], id: 21, serialNumber: null }] };
    const articles = () => Array.from(panel().querySelectorAll('article'));

    it('renders one structured document per RMA', () => {
      respond([RMA, SECOND]);
      // Reprova hoje: o laudo é uma tabela de quatro colunas, sem um article por RMA (html:45-77).
      expect(articles().length).toBe(2);
      expect(normalize(articles()[0].querySelector('h3')?.textContent)).toContain('RMA-REAL');
      expect(normalize(articles()[0].querySelector('h3')?.textContent)).toContain('Cliente Alfa');
      expect(normalize(articles()[1].querySelector('h3')?.textContent)).toContain('RMA-SECOND');
      for (const article of articles()) {
        expect(article.getAttribute('aria-labelledby')).toBe(article.querySelector('h3')!.id);
        expect(Array.from(article.querySelectorAll('h4')).map((h4) => normalize(h4.textContent)))
          .toEqual(['Produtos', 'Falha relatada', 'Diagnóstico', 'Reparo e testes']);
      }
      expect(pair(articles()[0], 'Status')).toBe('Diagnóstico');
      expect(pair(articles()[0], 'Entrada')).toBe('20/10/2026');
      // Preservação: diagnóstico pendente.
      expect(normalize(articles()[1].textContent)).toContain('Diagnóstico pendente');
    });

    it('separates product identification in columns', () => {
      respond([RMA, SECOND]);
      const table = articles()[0].querySelector('table')!;
      // Reprova hoje: a identificação é concatenada em "SKU · Série · Lote" (html:54).
      expect(headers(table)).toEqual(['Produto', 'SKU', 'Série', 'Lote']);
      expect(['Produto', 'SKU', 'Série', 'Lote'].map((header) => cell(table, 0, header)))
        .toEqual(['Controlador', 'SKU-1', 'SER-A', 'LOTE-A']);
      expect(cell(articles()[1].querySelector('table')!, 0, 'Série')).toBe('Não informada');
      expect(articles()[0].querySelector('table')!.closest('.table-wrap')).not.toBeNull();
    });

    it('uses the detail labels and separates technician and date', () => {
      respond();
      const article = articles()[0];
      // Reprova hoje: "Técnico Alfa · 20/10/2026" (html:64) e rótulos "Causa", "Observações" e "Peças".
      expect(pair(article, 'Técnico')).toBe('Técnico Alfa');
      expect(pair(article, 'Data do diagnóstico')).toBe('20/10/2026');
      expect(pair(article, 'Causa provável')).toBe(FAILURE_CAUSE_LABELS.INCORRECT_USAGE);
      expect(pair(article, 'Notas')).toBe('Inspeção visual');
      expect(pair(article, 'Peças trocadas')).toBe('Conector USB');
      // Preservação: os demais textos do laudo.
      expect(pair(article, 'Reparo')).toBe('Conector substituído');
      expect(pair(article, 'Testes')).toBe('Teste aprovado');
      expect(normalize(article.textContent)).toContain('Conector danificado');
      expect(normalize(article.textContent)).toContain('Não liga');
    });
  });
});

interface ReportsHarness {
  form: FormGroup;
  loadReports(): void;
}
