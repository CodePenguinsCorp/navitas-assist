import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroupDirective } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { ClientRequest, ClientResponse } from '../../core/models';
import { ClientsComponent } from './clients.component';

const CLIENT: ClientResponse = {
  id: 7, legalName: 'Cliente teste', tradeName: 'Nome preservado', notes: 'Nota preservada',
  documentNumber: null, contactName: null, email: null, phone: null, address: null,
  createdAt: '2026-11-03T12:00:00Z', updatedAt: '2026-11-03T12:00:00Z',
};
const FIELDS = [
  { name: 'tradeName', other: 'notes', limit: 120, error: 'Informe um nome fantasia com até 120 caracteres.' },
  { name: 'notes', other: 'tradeName', limit: 1000, error: 'Informe observações com até 1000 caracteres.' },
] as const;

for (const mode of ['create', 'edit'] as const) {
  describe('Client optional limits: ' + mode, () => {
    let fixture: ComponentFixture<ClientsComponent>;
    let http: HttpTestingController;
    let page: HTMLElement;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [ClientsComponent], providers: [provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();
      http = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(ClientsComponent);
      http.expectOne('/api/clients').flush([CLIENT]);
      fixture.detectChanges();
      page = fixture.nativeElement;
      button(mode === 'create' ? 'Novo cliente' : 'Editar').click();
      fixture.detectChanges();
      input('legalName', CLIENT.legalName);
      input('tradeName', CLIENT.tradeName!);
      input('notes', CLIENT.notes!);
    });

    afterEach(() => http.verify());

    function button(label: string): HTMLButtonElement {
      return [...page.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)!;
    }

    function field(name: string): HTMLInputElement | HTMLTextAreaElement {
      return page.querySelector('[formControlName="' + name + '"]')!;
    }

    function input(name: string, value: string): void {
      field(name).value = value;
      field(name).dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }

    function submit(): void {
      page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    }

    function expectSaved(tradeName: string | null, notes: string | null): void {
      const request = http.expectOne({ method: mode === 'create' ? 'POST' : 'PUT', url: mode === 'create' ? '/api/clients' : '/api/clients/7' });
      expect(request.request.body).toEqual({
        legalName: CLIENT.legalName, tradeName, notes, documentNumber: null,
        contactName: null, email: null, phone: null, address: null,
      } satisfies ClientRequest);
      const saved: ClientResponse = { ...CLIENT, ...request.request.body };
      request.flush(saved);
      http.expectOne({ method: 'GET', url: '/api/clients' }).flush([saved]);
      fixture.detectChanges();
      expect(page.querySelector('form')).toBeNull();
      expect(page.textContent).toContain(mode === 'create' ? 'cadastrado com sucesso' : 'atualizado com sucesso');
    }

    for (const definition of FIELDS) {
      it('shows the ' + definition.name + ' limit without a premature error', () => {
        expect(field(definition.name).maxLength).toBe(definition.limit);
        expect(field(definition.name).closest('label')!.textContent).toContain('Até ' + definition.limit + ' caracteres.');
        expect(field(definition.name).closest('label')!.querySelector('.field-error')).toBeNull();
      });

      it('identifies dirty ' + definition.name + ' overflow, then saves the correction without losing the other field', () => {
        input(definition.name, 'a'.repeat(definition.limit + 1));
        const error = field(definition.name).closest('label')!.querySelector('.field-error')?.textContent;
        submit();
        http.expectNone((request) => request.method === 'POST' || request.method === 'PUT');
        expect(error).toContain(definition.error);
        expect(field(definition.other).value).toBe(CLIENT[definition.other]);

        const corrected = 'a'.repeat(definition.limit);
        input(definition.name, corrected);
        expect(field(definition.name).closest('label')!.querySelector('.field-error')).toBeNull();
        submit();
        expectSaved(definition.name === 'tradeName' ? corrected : CLIENT.tradeName, definition.name === 'notes' ? corrected : CLIENT.notes);
      });

      it('reveals untouched programmatic ' + definition.name + ' overflow on submit and sends no request', () => {
        const form = fixture.debugElement.query(By.directive(FormGroupDirective)).injector.get(FormGroupDirective).form;
        form.markAsPristine();
        form.markAsUntouched();
        form.get(definition.name)!.setValue('a'.repeat(definition.limit + 1));
        fixture.detectChanges();
        expect(field(definition.name).closest('label')!.querySelector('.field-error')).toBeNull();
        submit();
        http.expectNone((request) => request.method === 'POST' || request.method === 'PUT');
        expect(field(definition.name).closest('label')!.querySelector('.field-error')?.textContent).toContain(definition.error);
      });

      it('submits all ' + definition.limit + ' characters of ' + definition.name + ', including multibyte text', () => {
        const value = 'ç'.repeat(definition.limit);
        input(definition.name, value);
        submit();
        expectSaved(definition.name === 'tradeName' ? value : CLIENT.tradeName, definition.name === 'notes' ? value : CLIENT.notes);
      });
    }

    for (const empty of ['', '   ']) {
      it('keeps empty optional values valid and normalizes ' + JSON.stringify(empty) + ' to null', () => {
        input('tradeName', empty);
        input('notes', empty);
        submit();
        expectSaved(null, null);
      });
    }
  });
}
