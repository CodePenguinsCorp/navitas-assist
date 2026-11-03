import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClientResponse } from '../../core/models';
import { ClientsComponent } from './clients.component';

const CLIENT: ClientResponse = {
  id: 1, legalName: 'Alfa', tradeName: null, documentNumber: '123',
  email: 'alfa@example.com', phone: null, address: null, notes: null,
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
};

function pageOf(content: ClientResponse[]) {
  return { content, page: 0, size: 20, totalElements: content.length, totalPages: 1 };
}

describe('ClientsComponent pending save lifecycle', () => {
  let fixture: ComponentFixture<ClientsComponent>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ClientsComponent);
    flushLoad([CLIENT]);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function flushLoad(content: ClientResponse[]): void {
    http.expectOne((request) => request.method === 'GET' && request.url === '/api/clients').flush(pageOf(content));
    http.expectOne('/api/clients/summary').flush({ total: content.length, withPhone: 0, withDocument: 0, withEmail: 0 });
  }

  function openEditor(mode: 'create' | 'edit'): void {
    page.querySelector<HTMLButtonElement>(mode === 'create' ? '.page-heading button' : '.client-actions button')!.click();
    fixture.detectChanges();
  }

  function enterName(): void {
    const name = page.querySelector<HTMLInputElement>('[formControlName="legalName"]')!;
    name.value = 'Cliente salvo';
    name.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function submitSave(mode: 'create' | 'edit'): TestRequest {
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    return http.expectOne({ method: mode === 'create' ? 'POST' : 'PUT', url: mode === 'create' ? '/api/clients' : '/api/clients/1' });
  }

  function succeed(request: TestRequest, mode: 'create' | 'edit'): void {
    const saved: ClientResponse = { ...CLIENT, id: mode === 'create' ? 4 : 1, legalName: 'Cliente salvo' };
    request.flush(saved);
    flushLoad(mode === 'create' ? [CLIENT, saved] : [saved]);
    fixture.detectChanges();
  }

  function fail(request: TestRequest): void {
    request.flush({ timestamp: '2026-10-28T12:00:00Z', status: 400, error: 'Bad Request', message: 'Client not saved', details: [] },
      { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
  }

  describe.each(['create', 'edit'] as const)('%s', (mode) => {
    it.each(['overlay', 'close'] as const)('keeps the pending editor open through %s and closes after success', (control) => {
      openEditor(mode);
      enterName();
      const request = submitSave(mode);
      const close = page.querySelector<HTMLButtonElement>('.modal-close')!;
      const closeDisabled = close.disabled;
      const cancelDisabled = page.querySelector<HTMLButtonElement>('form .button-secondary')!.disabled;
      if (control === 'overlay') {
        page.querySelector<HTMLElement>('.modal-overlay')!.click();
      } else {
        close.click();
      }
      fixture.detectChanges();
      const stillOpen = page.querySelector('.modal-overlay') !== null;
      const cancelled = request.cancelled;
      succeed(request, mode);

      expect(stillOpen).toBe(true);
      expect(closeDisabled).toBe(true);
      expect(cancelDisabled).toBe(true);
      expect(cancelled).toBe(false);
      expect(page.querySelector('.modal-overlay')).toBeNull();
      expect(page.querySelector('tbody')?.textContent).toContain('Cliente salvo');
    });

    it('keeps values on failure and allows closing once the request has ended', () => {
      openEditor(mode);
      enterName();
      fail(submitSave(mode));

      expect(page.querySelector('[role="alert"]')?.textContent).toContain('Client not saved');
      expect(page.querySelector<HTMLInputElement>('[formControlName="legalName"]')!.value).toBe('Cliente salvo');
      expect(page.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(false);
      expect(page.querySelector<HTMLButtonElement>('form .button-secondary')!.disabled).toBe(false);
      page.querySelector<HTMLButtonElement>('.modal-close')!.click();
      fixture.detectChanges();
      expect(page.querySelector('.modal-overlay')).toBeNull();
    });

    it('can retry after a failed save and then closes and refreshes normally', () => {
      openEditor(mode);
      enterName();
      fail(submitSave(mode));
      const retry = submitSave(mode);
      expect(retry.request.body.legalName).toBe('Cliente salvo');
      expect(page.querySelector('[role="alert"]')).toBeNull();
      succeed(retry, mode);

      expect(page.querySelector('.modal-overlay')).toBeNull();
      expect(page.querySelector('tbody')?.textContent).toContain('Cliente salvo');
    });
  });

  it.each(['overlay', 'close'] as const)('preserves idle editor closure through %s', (control) => {
    openEditor('create');
    page.querySelector<HTMLElement>(control === 'overlay' ? '.modal-overlay' : '.modal-close')!.click();
    fixture.detectChanges();
    expect(page.querySelector('.modal-overlay')).toBeNull();
  });

  it('keeps invalid form validation without sending a save request', () => {
    openEditor('create');
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    http.expectNone({ method: 'POST', url: '/api/clients' });
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Revise os campos destacados');
    expect(page.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(false);
  });
});
