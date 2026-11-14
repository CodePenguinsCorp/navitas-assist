import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProfileRequest } from '../models';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ProfileService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists profiles with page params and a trimmed query, omitting an empty query', () => {
    service.list({ query: '  téc ', page: 2, size: 50 }).subscribe();
    const filtered = http.expectOne((request) => request.url === '/api/profiles');
    expect(filtered.request.method).toBe('GET');
    expect(filtered.request.params.get('query')).toBe('téc');
    expect(filtered.request.params.get('page')).toBe('2');
    expect(filtered.request.params.get('size')).toBe('50');
    filtered.flush({ content: [], page: 2, size: 50, totalElements: 0, totalPages: 0 });

    service.list({ query: '   ', page: 0, size: 20 }).subscribe();
    const plain = http.expectOne((request) => request.url === '/api/profiles');
    expect(plain.request.params.has('query')).toBe(false);
    plain.flush({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
  });

  it('creates, updates and deletes on the profile endpoints', () => {
    const payload: ProfileRequest = { name: 'Supervisor', permissions: ['rma.ver', 'relatorios.ver'] };
    service.create(payload).subscribe();
    const create = http.expectOne('/api/profiles');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(payload);
    create.flush({});

    service.update(7, payload).subscribe();
    const update = http.expectOne('/api/profiles/7');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual(payload);
    update.flush({});

    service.delete(7).subscribe();
    const remove = http.expectOne('/api/profiles/7');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('requests the permission catalog once for two subscriptions', () => {
    const first = vi.fn();
    const second = vi.fn();
    service.permissionCatalog().subscribe(first);
    service.permissionCatalog().subscribe(second);
    const request = http.expectOne('/api/permissions');
    expect(request.request.method).toBe('GET');
    request.flush([{ module: 'RMA', label: 'Ordens de serviço', permissions: [{ code: 'rma.ver', label: 'Ver ordens de serviço, Kanban e dashboard' }] }]);
    service.permissionCatalog().subscribe();
    http.expectNone('/api/permissions');
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledWith(first.mock.calls[0][0]);
  });

  it('requests the catalog again after a failure', () => {
    const error = vi.fn();
    service.permissionCatalog().subscribe({ error });
    http.expectOne('/api/permissions').flush({ message: 'Indisponível' }, { status: 503, statusText: 'Unavailable' });
    expect(error).toHaveBeenCalledOnce();

    service.permissionCatalog().subscribe();
    http.expectOne('/api/permissions').flush([]);
  });

  it('caches the profile options until they are invalidated', () => {
    service.options().subscribe();
    service.options().subscribe();
    http.expectOne('/api/profiles/options').flush([{ id: 1, name: 'Administrador', permissions: ['rma.ver'] }]);
    service.options().subscribe();
    http.expectNone('/api/profiles/options');

    service.invalidateOptions();
    service.options().subscribe();
    http.expectOne('/api/profiles/options').flush([]);
  });
});
