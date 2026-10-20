import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';

describe('HTTP XSRF configuration', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=csrf-test-token; path=/';
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('adds the CSRF cookie value to relative mutation requests', () => {
    http.post('/api/rmas', { clientId: 1 }).subscribe();

    const request = httpTesting.expectOne('/api/rmas');
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-test-token');
    request.flush({});
  });

  it('does not add the CSRF header to safe requests', () => {
    http.get('/api/rmas').subscribe();

    const request = httpTesting.expectOne('/api/rmas');
    expect(request.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    request.flush([]);
  });
});
