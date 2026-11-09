import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoadingService } from '../../core/services/loading.service';
import { LoadingOverlayComponent } from './loading-overlay.component';

describe('LoadingOverlayComponent', () => {
  let fixture: ComponentFixture<LoadingOverlayComponent>;
  let loading: LoadingService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [LoadingOverlayComponent] });
    loading = TestBed.inject(LoadingService);
    fixture = TestBed.createComponent(LoadingOverlayComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('stays hidden initially and during the delay', () => {
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    loading.start();
    vi.advanceTimersByTime(199);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
  });

  it('renders exactly one polite status with loading text and a decorative spinner', () => {
    loading.start();
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    const statuses = fixture.nativeElement.querySelectorAll('[role="status"]');
    expect(statuses).toHaveLength(1);
    expect(statuses[0].getAttribute('aria-live')).toBe('polite');
    expect(statuses[0].textContent.trim()).toBe('Carregando...');
    expect(statuses[0].querySelector('.loading-overlay__spinner')?.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('[tabindex], button, input')).toBeNull();
    loading.finish();
    vi.advanceTimersByTime(399);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
  });
});
