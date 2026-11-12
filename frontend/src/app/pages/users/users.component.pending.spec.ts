import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UserAccountResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { UsersComponent } from './users.component';

const SAMPLE_USER: UserAccountResponse = {
  id: 1, username: 'technician', fullName: 'Operador', profile: { id: 3, name: 'Técnico' }, extraPermissions: [], active: true,
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
};

function flushUserLists(http: HttpTestingController, content: unknown[]): void {
  http.expectOne(r => r.method === 'GET' && r.url.split('?')[0] === '/api/users').flush({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 });
  http.expectOne('/api/users/summary').flush({ total: content.length, active: content.length, admins: 0, roles: 0 });
}

describe('UsersComponent pending save lifecycle', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { currentUser: () => null, refreshSession: () => of(null) } }]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(UsersComponent);
    flushUserLists(http, [SAMPLE_USER]);
    http.expectOne('/api/profiles/options').flush([{ id: 2, name: 'Atendimento', permissions: [] }, { id: 3, name: 'Técnico', permissions: [] }]);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function openEditor(mode: 'create' | 'edit'): void {
    page.querySelector<HTMLButtonElement>(
      mode === 'create' ? '.page-heading button' : '.row-actions button'
    )!.click();
    fixture.detectChanges();
    http.match('/api/permissions').forEach((request) => request.flush([]));
    fixture.detectChanges();
  }

  function enterFields(mode: 'create' | 'edit'): void {
    const enter = (name: string, value: string) => {
      const input = page.querySelector<HTMLInputElement>(`[formControlName="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (mode === 'create') {
      enter('username', 'operator');
      enter('password', 'fake-password');
      (fixture.componentInstance as unknown as { form: { controls: { profileId: { setValue(id: number): void } } } }).form.controls.profileId.setValue(2);
    }
    enter('fullName', 'Operador salvo');
  }

  function submitSave(mode: 'create' | 'edit'): TestRequest {
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    const request = http.expectOne({
      method: mode === 'create' ? 'POST' : 'PUT',
      url: mode === 'create' ? '/api/users' : '/api/users/1'
    });
    expect(request.request.body.password).toBe(mode === 'create' ? 'fake-password' : null);
    return request;
  }

  function succeed(request: TestRequest, mode: 'create' | 'edit'): void {
    const saved: UserAccountResponse = { ...SAMPLE_USER, id: mode === 'create' ? 4 : 1,
      username: mode === 'create' ? 'operator' : SAMPLE_USER.username,
      profile: mode === 'create' ? { id: 2, name: 'Atendimento' } : SAMPLE_USER.profile, fullName: 'Operador salvo' };
    request.flush(saved);
    flushUserLists(http, 
      mode === 'create' ? [SAMPLE_USER, saved] : [saved]
    );
    fixture.detectChanges();
  }

  function fail(request: TestRequest): void {
    request.flush(
      { timestamp: '2026-10-28T12:00:00Z', status: 400, error: 'Bad Request',
        message: 'User not saved', details: [] },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();
  }

  describe.each(['create', 'edit'] as const)('%s', (mode) => {
    it.each(['overlay', 'close'] as const)('keeps a pending save open through %s and closes on success', (control) => {
      openEditor(mode);
      enterFields(mode);
      const request = submitSave(mode);
      const close = page.querySelector<HTMLButtonElement>('.modal-close')!;
      const closeDisabled = close.disabled;
      const cancelDisabled = page.querySelector<HTMLButtonElement>('form .button-secondary')!.disabled;
      page.querySelector<HTMLElement>(control === 'overlay' ? '.modal-overlay' : '.modal-close')!.click();
      fixture.detectChanges();
      const stillOpen = page.querySelector('.modal-overlay') !== null;
      const cancelled = request.cancelled;
      succeed(request, mode);

      expect(stillOpen).toBe(true);
      expect(closeDisabled).toBe(true);
      expect(cancelDisabled).toBe(true);
      expect(cancelled).toBe(false);
      expect(page.querySelector('.modal-overlay')).toBeNull();
      expect(page.querySelector('tbody')?.textContent).toContain('Operador salvo');
    });

    it('keeps values on failure and allows closing once the request has ended', () => {
      openEditor(mode);
      enterFields(mode);
      fail(submitSave(mode));

      expect(page.querySelector('[role="alert"]')?.textContent).toContain('User not saved');
      expect(page.querySelector<HTMLInputElement>('[formControlName="fullName"]')!.value).toBe('Operador salvo');
      expect(page.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(false);
      expect(page.querySelector<HTMLButtonElement>('form .button-secondary')!.disabled).toBe(false);
      page.querySelector<HTMLButtonElement>('.modal-close')!.click();
      fixture.detectChanges();
      expect(page.querySelector('.modal-overlay')).toBeNull();
    });

    it('can retry after a failed save and then closes and refreshes normally', () => {
      openEditor(mode);
      enterFields(mode);
      fail(submitSave(mode));
      const retry = submitSave(mode);
      expect(retry.request.body.fullName).toBe('Operador salvo');
      expect(page.querySelector('[role="alert"]')).toBeNull();
      succeed(retry, mode);

      expect(page.querySelector('.modal-overlay')).toBeNull();
      expect(page.querySelector('tbody')?.textContent).toContain('Operador salvo');
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
    http.expectNone({ method: 'POST', url: '/api/users' });
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Revise os campos destacados');
    expect(page.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(false);
  });

  it('shows Cancelar before the primary action in the form dialog', () => {
    openEditor('create');

    expectCancelBeforePrimary(page);
  });

  it('shows Cancelar before the delete action', () => {
    (fixture.componentInstance as unknown as { openDeleteModal(user: UserAccountResponse): void }).openDeleteModal(SAMPLE_USER);
    fixture.detectChanges();

    expectCancelBeforePrimary(page);
  });
});
