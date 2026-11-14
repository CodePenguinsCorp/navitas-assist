import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppShellComponent } from './app-shell.component';

describe('AppShellComponent polling visibility', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    vi.useFakeTimers();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    http.verify();
  });

  it('pauses while hidden, refreshes immediately on return and stops after destruction', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    http.expectOne('/api/notifications/summary').flush({ unread: 1 });

    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(120_000);
    http.expectNone('/api/notifications/summary');

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(0);
    http.expectOne('/api/notifications/summary').flush({ unread: 2 });
    vi.advanceTimersByTime(60_000);
    http.expectOne('/api/notifications/summary').flush({ unread: 3 });

    fixture.destroy();
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(120_000);
    http.expectNone('/api/notifications/summary');
  });

  it('does not poll when the shell starts hidden', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    vi.advanceTimersByTime(60_000);
    http.expectNone('/api/notifications/summary');
  });
});
