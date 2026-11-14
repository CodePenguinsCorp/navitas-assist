import { TestBed } from '@angular/core/testing';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  let service: LoadingService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoadingService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('counts concurrent requests and never goes below zero', () => {
    service.finish();
    expect(service.pendingCount()).toBe(0);
    service.start();
    service.start();
    expect(service.pendingCount()).toBe(2);
    service.finish();
    expect(service.pendingCount()).toBe(1);
    service.finish();
    service.finish();
    expect(service.pendingCount()).toBe(0);
  });

  it('waits 200 ms from the first request without restarting for concurrent requests', () => {
    service.start();
    vi.advanceTimersByTime(199);
    expect(service.visible()).toBe(false);
    service.start();
    vi.advanceTimersByTime(1);
    expect(service.visible()).toBe(true);
  });

  it('never flashes for a request that ends before the delay', () => {
    service.start();
    vi.advanceTimersByTime(199);
    service.finish();
    vi.advanceTimersByTime(1000);
    expect(service.visible()).toBe(false);
    expect(service.pendingCount()).toBe(0);
  });

  it('keeps the overlay visible for at least 400 ms after it appears', () => {
    service.start();
    vi.advanceTimersByTime(200);
    expect(service.visible()).toBe(true);
    service.finish();
    expect(service.pendingCount()).toBe(0);
    vi.advanceTimersByTime(399);
    expect(service.visible()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(service.visible()).toBe(false);
  });

  it('hides immediately after a long request once the minimum has elapsed', () => {
    service.start();
    vi.advanceTimersByTime(1000);
    service.finish();
    expect(service.visible()).toBe(false);
  });

  it('keeps showing until every concurrent request has finished', () => {
    service.start();
    service.start();
    vi.advanceTimersByTime(600);
    service.finish();
    expect(service.visible()).toBe(true);
    service.finish();
    expect(service.visible()).toBe(false);
  });

  it('cancels a pending hide when a new request arrives during minimum visibility', () => {
    service.start();
    vi.advanceTimersByTime(200);
    service.finish();
    vi.advanceTimersByTime(200);
    service.start();
    vi.advanceTimersByTime(200);
    expect(service.visible()).toBe(true);
    expect(service.pendingCount()).toBe(1);
    service.finish();
    expect(service.visible()).toBe(false);
  });

  it('uses a fresh delay after a fast completed request', () => {
    service.start();
    vi.advanceTimersByTime(150);
    service.finish();
    service.start();
    vi.advanceTimersByTime(199);
    expect(service.visible()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(service.visible()).toBe(true);
  });

  it('hides an open overlay at once while suppressed and keeps the pending count', () => {
    service.start();
    vi.advanceTimersByTime(200);
    expect(service.visible()).toBe(true);
    const release = service.suppress();
    expect(service.visible()).toBe(false);
    expect(service.suppressed()).toBe(true);
    expect(service.pendingCount()).toBe(1);
    service.start();
    vi.advanceTimersByTime(1000);
    expect(service.visible()).toBe(false);
    service.finish();
    service.finish();
    release();
    vi.advanceTimersByTime(1000);
    expect(service.visible()).toBe(false);
  });

  it('never schedules the overlay while suppressed and waits a fresh delay after release', () => {
    const release = service.suppress();
    service.start();
    vi.advanceTimersByTime(1000);
    expect(service.visible()).toBe(false);
    release();
    expect(service.suppressed()).toBe(false);
    vi.advanceTimersByTime(199);
    expect(service.visible()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(service.visible()).toBe(true);
    service.finish();
    vi.advanceTimersByTime(400);
    expect(service.visible()).toBe(false);
  });

  it('cancels the delay of a request started just before suppression', () => {
    service.start();
    vi.advanceTimersByTime(150);
    const release = service.suppress();
    vi.advanceTimersByTime(1000);
    expect(service.visible()).toBe(false);
    service.finish();
    release();
    vi.advanceTimersByTime(1000);
    expect(service.visible()).toBe(false);
  });

  it('stays suppressed until every holder releases, and a repeated release counts once', () => {
    const first = service.suppress();
    const second = service.suppress();
    service.start();
    first();
    first();
    vi.advanceTimersByTime(1000);
    expect(service.suppressed()).toBe(true);
    expect(service.visible()).toBe(false);
    second();
    vi.advanceTimersByTime(200);
    expect(service.visible()).toBe(true);
  });

  it('cleans up pending visibility timers when its injector is destroyed', () => {
    service.start();
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(1000);
    expect(service.visible()).toBe(false);
  });
});
