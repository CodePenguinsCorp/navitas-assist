import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup, FormGroupDirective } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { DiagnosisRequest, RmaResponse, WarrantyStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmasComponent } from './rmas.component';

const STAMP = '2026-06-16T12:00:00Z';
const VALUES: DiagnosisRequest = {
  foundFailure: 'Falha preservada', technicianName: 'Técnico preservado', notes: 'Notas preservadas',
  failureType: 'POWER_SUPPLY', probableCause: 'COMPONENT', diagnosedAt: '2026-06-16',
};
const RMA: RmaResponse = {
  id: 1, code: 'RMA-2026-000001', clientId: 1, clientName: 'Cliente',
  items: [{ id: 1, productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null,
    serialNumber: 'SER-2', manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: null, warrantyStatus: WarrantyStatus.PENDING }],
  productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null, serialNumber: 'SER-2',
  manufacturedAt: null, purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-06-16',
  invoiceNumber: 'NF-123', receivedBy: 'operator', reportedFailure: 'Falha', receivedAccessories: null,
  physicalCondition: null, priority: 'MEDIUM', status: 'RECEIVED', assigneeId: null, assigneeName: null,
  repairSummary: null, replacedPartsSummary: null, testSummary: null, shippedAt: null, carrier: null,
  trackingCode: null, diagnosis: null, statusHistory: [], assignmentHistory: [],
  sla: { status: 'NORMAL', startedAt: STAMP, warningAt: '2026-06-17T07:12:00Z',
    dueAt: '2026-06-17T12:00:00Z', elapsedSeconds: 0, limitSeconds: 86400 },
  createdAt: STAMP, updatedAt: STAMP,
};
const NEXT_RMA: RmaResponse = { ...RMA, id: 2, code: 'RMA-2026-000002' };
const FIELDS = [
  { name: 'foundFailure', other: 'technicianName', limit: 2000, error: 'Informe a falha encontrada com até 2000 caracteres.' },
  { name: 'technicianName', other: 'foundFailure', limit: 120, error: 'Informe o técnico com até 120 caracteres.' },
] as const;

for (const existing of [false, true]) {
  describe('Required diagnosis limits, existing=' + existing, () => {
    let fixture: ComponentFixture<RmasComponent>;
    let http: HttpTestingController;
    let page: HTMLElement;
    let current: RmaResponse;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [RmasComponent], providers: [provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();
      http = TestBed.inject(HttpTestingController);
      TestBed.inject(AuthService).login({ username: 'tech', password: 'test-only' }).subscribe();
      http.expectOne('/api/auth/csrf').flush(null);
      http.expectOne('/api/auth/login').flush({ username: 'tech', fullName: 'Técnica teste', role: 'TECHNICIAN' });
      current = { ...RMA, diagnosis: existing ? { id: 9, ...VALUES, createdAt: STAMP, updatedAt: STAMP } : null };
      fixture = TestBed.createComponent(RmasComponent);
      http.expectOne('/api/clients').flush([]);
      http.expectOne('/api/products').flush([]);
      http.expectOne('/api/rmas').flush([current, NEXT_RMA]);
      fixture.detectChanges();
      page = fixture.nativeElement;
      page.querySelector<HTMLElement>('.rma-table-row')!.click();
      fixture.detectChanges();
      [...page.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'Diagnóstico')!.click();
      fixture.detectChanges();
    });

    afterEach(() => http.verify());

    function field(name: string): HTMLInputElement | HTMLTextAreaElement {
      return page.querySelector('[formControlName="' + name + '"]')!;
    }

    function form(): FormGroup {
      return fixture.debugElement.queryAll(By.directive(FormGroupDirective))
        .find((item) => item.nativeElement === field('foundFailure').closest('form'))!.injector.get(FormGroupDirective).form;
    }

    function input(name: string, value: string): void {
      field(name).value = value;
      field(name).dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }

    function fillValid(): void {
      form().patchValue(VALUES);
      fixture.detectChanges();
    }

    function submit(): void {
      field('foundFailure').closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    }

    function error(name: string): string | null | undefined {
      return field(name).closest('.field-group')!.querySelector('.field-error')?.textContent;
    }

    function expectSaved(foundFailure: string, technicianName: string): void {
      const request = http.expectOne({ method: 'PUT', url: '/api/rmas/1/diagnosis' });
      expect(request.request.body).toEqual({
        foundFailure, technicianName, failureType: 'POWER_SUPPLY', probableCause: 'COMPONENT',
        notes: 'Notas preservadas', diagnosedAt: '2026-06-16',
      } satisfies DiagnosisRequest);
      const updated: RmaResponse = { ...current, diagnosis: { id: 9, ...request.request.body, createdAt: STAMP, updatedAt: STAMP } };
      request.flush(updated);
      http.expectOne({ method: 'GET', url: '/api/rmas' }).flush([updated, NEXT_RMA]);
      fixture.detectChanges();
      expect(page.querySelector('#foundFailure')).toBeNull();
      expect(page.textContent).toContain('Diagnóstico do RMA-2026-000001 salvo com sucesso.');
    }

    it('starts another RMA diagnosis without stale errors or interaction state', () => {
      fillValid();
      input('foundFailure', 'a'.repeat(2001));
      input('technicianName', 'a'.repeat(121));
      submit();
      http.expectNone((request) => request.method === 'PUT');
      expect(error('foundFailure')).toContain(FIELDS[0].error);
      expect(error('technicianName')).toContain(FIELDS[1].error);
      [...page.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'Cancelar')!.click();
      fixture.detectChanges();
      page.querySelector<HTMLElement>('[aria-label="Abrir detalhes do RMA RMA-2026-000002"]')!.click();
      fixture.detectChanges();
      [...page.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'Diagnóstico')!.click();
      fixture.detectChanges();

      expect(field('foundFailure').value).toBe('');
      expect(field('technicianName').value).toBe('Técnica teste');
      expect(error('foundFailure')).toBeUndefined();
      expect(error('technicianName')).toBeUndefined();
      expect(form().pristine).toBe(true);
      expect(form().untouched).toBe(true);
      expect(form().get('notes')!.value).toBe('');
      http.expectNone((request) => request.method === 'PUT');
    });

    for (const definition of FIELDS) {
      it('informs the ' + definition.name + ' limit without an initial error', () => {
        expect(field(definition.name).maxLength).toBe(definition.limit);
        expect(field(definition.name).closest('.field-group')!.textContent).toContain('Até ' + definition.limit + ' caracteres.');
        expect(error(definition.name)).toBeUndefined();
      });

      it('identifies empty ' + definition.name + ' after submission without sending PUT', () => {
        fillValid();
        form().get(definition.name)!.setValue('');
        fixture.detectChanges();
        expect(error(definition.name)).toBeUndefined();
        submit();
        http.expectNone((request) => request.method === 'PUT');
        expect(error(definition.name)).toContain(definition.error);
      });

      it('identifies untouched programmatic ' + definition.name + ' overflow after submission', () => {
        fillValid();
        form().get(definition.name)!.setValue('a'.repeat(definition.limit + 1));
        fixture.detectChanges();
        expect(error(definition.name)).toBeUndefined();
        submit();
        http.expectNone((request) => request.method === 'PUT');
        expect(error(definition.name)).toContain(definition.error);
      });

      it('shows dirty ' + definition.name + ' overflow, then saves a trimmed correction preserving other fields', () => {
        fillValid();
        input(definition.name, 'a'.repeat(definition.limit + 1));
        const feedback = error(definition.name);
        submit();
        http.expectNone((request) => request.method === 'PUT');
        expect(feedback).toContain(definition.error);
        expect(field(definition.other).value).toBe(VALUES[definition.other]);
        const trimmed = 'ç'.repeat(definition.limit - 4);
        input(definition.name, '  ' + trimmed + '  ');
        expect(error(definition.name)).toBeUndefined();
        submit();
        expectSaved(definition.name === 'foundFailure' ? trimmed : VALUES.foundFailure, definition.name === 'technicianName' ? trimmed : VALUES.technicianName);
      });

      it('sends all ' + definition.limit + ' multibyte characters of ' + definition.name, () => {
        fillValid();
        const value = 'ç'.repeat(definition.limit);
        input(definition.name, value);
        submit();
        expectSaved(definition.name === 'foundFailure' ? value : VALUES.foundFailure, definition.name === 'technicianName' ? value : VALUES.technicianName);
      });
    }
  });
}
