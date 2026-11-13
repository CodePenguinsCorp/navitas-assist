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
      manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: '2026-10-20', warrantyStatus: WarrantyStatus.IN_WARRANTY }
  ],
  productId: 3, productName: 'Controlador', productSku: 'SKU-1', batchNumber: 'LOTE-A', serialNumber: 'SER-A', manufacturedAt: null,
  purchaseDate: '2025-10-20', purchaseDateUnknown: false, entryDate: '2026-10-20', invoiceNumber: 'NF-1', receivedBy: 'admin',
  reportedFailure: 'Não liga', receivedAccessories: null, physicalCondition: null, priority: 'HIGH', status: 'IN_DIAGNOSIS',
  currentBlock: null, blockHistory: [],
  sla: { status: 'NORMAL', startedAt: '2026-10-20T12:00:00Z', warningAt: '2026-10-22T02:24:00Z',
    dueAt: '2026-10-22T12:00:00Z', elapsedSeconds: 7200, limitSeconds: 172800 }, dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null, daysUntilDue: null }, stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T12:00:00Z', leftAt: null, durationSeconds: 7200 }], dueDateHistory: [],
  assigneeId: null, assigneeName: null, repairSummary: null, replacedPartsSummary: null,
  testSummary: null, shippedAt: null, carrier: null, trackingCode: null, diagnosis: null,
  statusHistory: [], assignmentHistory: [], createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
};

const REPORTS_URL = '/api/reports/rmas';

describe('ReportsComponent frame', () => {
  let fixture: ComponentFixture<ReportsComponent>;
  let component: ReportsHarness;
  let http: HttpTestingController;
  const root = () => fixture.nativeElement as HTMLElement;
  const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
  const text = () => normalize(root().textContent);
  const flush = (rmas: RmaResponse[] = [RMA]) => {
    http.expectOne((request) => request.url === REPORTS_URL)
      .flush({ generatedAt: '2026-10-21T01:00:00Z', entryFrom: '2026-07-24', entryTo: '2026-10-21', rmas });
    fixture.detectChanges();
  };
  const tabs = () => Array.from(root().querySelectorAll<HTMLButtonElement>('[role="tablist"] [role="tab"]'));
  const tab = (label: string) => tabs().find((item) => normalize(item.textContent) === label)!;
  const summaryValue = (label: string) => {
    const summary = root().querySelector('dl[aria-label="Consulta aplicada"]')!;
    const term = Array.from(summary.querySelectorAll('dt')).find((dt) => normalize(dt.textContent) === label)!;
    return normalize(term.nextElementSibling?.textContent);
  };
  const buttons = () => Array.from(root().querySelectorAll<HTMLButtonElement>('button')).map((button) => normalize(button.textContent));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsComponent], providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance as unknown as ReportsHarness;
    fixture.detectChanges();
    http.expectOne('/api/clients/options').flush([{ id: 2, legalName: 'Cliente Alfa', tradeName: null, documentNumber: null,
      email: null, phone: null, address: null, notes: null,
      createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' }]);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('shows the applied period, filters and generation instant', () => {
    flush();
    component.form.patchValue({ status: 'IN_DIAGNOSIS', clientId: 2 });
    component.loadReports();
    flush();
    // Reprova hoje: o template não mostra o dl "Consulta aplicada" com período e filtros (html:37).
    expect(summaryValue('Período de entrada')).toBe('24/07/2026 a 21/10/2026');
    expect(summaryValue('Status atual')).toBe('Diagnóstico');
    expect(summaryValue('Cliente')).toBe('Cliente Alfa');
    // Preservação parcial: o instante de geração já aparece hoje no texto da dica.
    expect(summaryValue('Gerado em')).toBe('20/10/2026, 22:00 (São Paulo)');

    component.form.patchValue({ status: 'RETURNED' });
    fixture.detectChanges();
    expect(summaryValue('Status atual')).toBe('Diagnóstico');
  });

  it('shows period validation beside the dates without a retry', () => {
    flush();
    const expectPeriodError = (message: string) => {
      const error = root().querySelector('#report-period-error');
      // Reprova hoje: a validação aparece como alerta com nova tentativa (html:31-35), sem #report-period-error.
      expect(normalize(error?.textContent)).toContain(message);
      expect(root().querySelector('#report-period-help')).not.toBeNull();
      for (const label of ['Data inicial de entrada', 'Data final de entrada']) {
        const trigger = root().querySelector(`[aria-label="${label}"]`)!;
        const ids = (trigger.getAttribute('aria-describedby') ?? '').split(' ');
        expect(ids).toContain('report-period-help');
        expect(ids).toContain('report-period-error');
        expect(trigger.getAttribute('aria-invalid')).toBe('true');
      }
      expect(buttons()).not.toContain('Tentar novamente');
      // Preservação: a consulta inválida continua sem HTTP.
      http.expectNone((request) => request.url === REPORTS_URL);
    };

    component.form.patchValue({ entryFrom: '2026-10-21', entryTo: '2026-10-20' });
    component.loadReports();
    fixture.detectChanges();
    expectPeriodError('A data inicial deve ser anterior ou igual à data final.');

    component.form.patchValue({ entryFrom: '2025-01-01', entryTo: '2026-01-02' });
    component.loadReports();
    fixture.detectChanges();
    expectPeriodError('O período do relatório deve ter no máximo 366 dias.');
  });

  it('switches report type in tabs without a new query', () => {
    flush();
    // Reprova hoje: o tipo é um select dentro do formulário, sem abas.
    expect(tabs().map((item) => normalize(item.textContent)))
      .toEqual(['Laudo técnico', 'Tempo por etapa', 'Garantia por produto', 'Devoluções']);
    tab('Garantia por produto').click();
    fixture.detectChanges();
    expect(tab('Garantia por produto').getAttribute('aria-selected')).toBe('true');
    expect(tab('Laudo técnico').getAttribute('aria-selected')).toBe('false');
    const panel = root().querySelector('[role="tabpanel"]:not([hidden])')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('Garantia por produto').id);
    expect(tab('Garantia por produto').getAttribute('aria-controls')).toBe(panel.id);
    expect(normalize(panel.querySelector('h2')?.textContent)).toBe('Garantia por produto');
    const form = root().querySelector('form')!;
    expect(form.querySelector('[aria-label="Tipo de relatório"]')).toBeNull();
    expect(normalize(form.textContent)).not.toContain('Relatório');
    // Preservação: a troca do tipo não faz HTTP.
    http.expectNone((request) => request.url === REPORTS_URL);
  });

  it.each([false, true])('keeps stable panels for every report tab (empty: %s)', (empty) => {
    flush(empty ? [] : [RMA]);
    const allTabs = tabs();
    const panels = allTabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')!)!);
    expect(panels.every(Boolean)).toBe(true);
    for (const activeTab of allTabs) {
      activeTab.click();
      fixture.detectChanges();
      for (const [index, tab] of allTabs.entries()) {
        const panel = document.getElementById(tab.getAttribute('aria-controls')!)!;
        expect(panel).toBe(panels[index]);
        expect(panel.getAttribute('role')).toBe('tabpanel');
        expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
        expect(panel.hidden).toBe(tab !== activeTab);
        expect(panel.childElementCount > 0).toBe(tab === activeTab);
      }
    }
    http.expectNone((request) => request.url === REPORTS_URL);
  });

  it.each(['Laudo técnico', 'Tempo por etapa', 'Garantia por produto', 'Devoluções'])('places the %s panel after the active tab in the focus order', (label) => {
    flush();
    const activeTab = tab(label);
    activeTab.click();
    fixture.detectChanges();
    const panel = document.getElementById(activeTab.getAttribute('aria-controls')!)!;
    expect(panel.tabIndex).toBe(0);
    const focusStops = Array.from(root().querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
      .filter((element) => element.tabIndex >= 0 && !element.closest('[hidden]') && !element.hasAttribute('disabled'));
    expect(focusStops[focusStops.indexOf(activeTab) + 1]).toBe(panel);
    panel.focus();
    expect(document.activeElement).toBe(panel);
  });

  it('moves between report tabs with the keyboard', () => {
    flush();
    const press = (label: string, key: string) => {
      tab(label).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      fixture.detectChanges();
    };
    // Reprova hoje: não há abas.
    expect(tabs().length).toBe(4);
    press('Laudo técnico', 'ArrowRight');
    expect(document.activeElement).toBe(tab('Tempo por etapa'));
    expect(component.form.controls['report'].value).toBe('aging');
    expect(tab('Tempo por etapa').getAttribute('aria-selected')).toBe('true');
    press('Tempo por etapa', 'End');
    expect(document.activeElement).toBe(tab('Devoluções'));
    press('Devoluções', 'ArrowRight');
    expect(document.activeElement).toBe(tab('Laudo técnico'));
    press('Laudo técnico', 'ArrowLeft');
    expect(document.activeElement).toBe(tab('Devoluções'));
    press('Devoluções', 'Home');
    expect(document.activeElement).toBe(tab('Laudo técnico'));
    expect(component.form.controls['report'].value).toBe('technical');
    expect(tabs().map((item) => item.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    http.expectNone((request) => request.url === REPORTS_URL);
  });

  it('counts consulted RMAs in the query summary', () => {
    const count = () => root().querySelector('.result-count');
    expect(count()).toBeNull();
    flush();
    // A contagem fica no resumo da consulta, não no cabeçalho.
    expect(normalize(count()?.textContent)).toBe('1 RMA');
    component.loadReports();
    fixture.detectChanges();
    expect(count()).toBeNull();
    flush([RMA, { ...RMA, id: 2, code: 'RMA-SECOND' }]);
    expect(normalize(count()?.textContent)).toBe('2 RMAs');
    component.loadReports();
    http.expectOne((request) => request.url === REPORTS_URL).flush({}, { status: 500, statusText: 'Server error' });
    fixture.detectChanges();
    expect(count()).toBeNull();
    expect(buttons()).toContain('Tentar novamente');
    expect(text()).not.toContain('RMA(s)');
  });
});

interface ReportsHarness {
  form: FormGroup;
  loadReports(): void;
}
