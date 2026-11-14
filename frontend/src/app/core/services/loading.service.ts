import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly pendingCountSignal = signal(0);
  private readonly visibleSignal = signal(false);
  private readonly suppressionsSignal = signal(0);
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private shownAt = 0;

  readonly pendingCount = this.pendingCountSignal.asReadonly();
  readonly visible = this.visibleSignal.asReadonly();
  /** True while a screen that gives its own feedback (the login) is on display: the overlay stays hidden. */
  readonly suppressed = computed(() => this.suppressionsSignal() > 0);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.showTimer);
      clearTimeout(this.hideTimer);
    });
  }

  start(): void {
    this.pendingCountSignal.update((count) => count + 1);
    clearTimeout(this.hideTimer);
    if (this.visible() || this.pendingCount() > 1) return;
    this.scheduleShow();
  }

  finish(): void {
    if (this.pendingCount() === 0) return;
    this.pendingCountSignal.update((count) => count - 1);
    if (this.pendingCount() > 0) return;

    clearTimeout(this.showTimer);
    this.showTimer = undefined;
    if (!this.visible()) return;

    const remaining = 400 - (Date.now() - this.shownAt);
    if (remaining <= 0) this.visibleSignal.set(false);
    else this.hideTimer = setTimeout(() => this.visibleSignal.set(false), remaining);
  }

  /**
   * Hides the overlay at once and keeps it hidden until the returned function is called; requests
   * still count. On release, requests still pending get a fresh 200 ms delay before it appears.
   */
  suppress(): () => void {
    this.suppressionsSignal.update((count) => count + 1);
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.showTimer = undefined;
    this.visibleSignal.set(false);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.suppressionsSignal.update((count) => count - 1);
      if (this.pendingCount() > 0) this.scheduleShow();
    };
  }

  private scheduleShow(): void {
    if (this.suppressed() || this.showTimer) return;
    this.showTimer = setTimeout(() => {
      this.showTimer = undefined;
      this.shownAt = Date.now();
      this.visibleSignal.set(true);
    }, 200);
  }
}
