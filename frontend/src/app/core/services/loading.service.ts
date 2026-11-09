import { DestroyRef, Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly pendingCountSignal = signal(0);
  private readonly visibleSignal = signal(false);
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private shownAt = 0;

  readonly pendingCount = this.pendingCountSignal.asReadonly();
  readonly visible = this.visibleSignal.asReadonly();

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

    this.showTimer = setTimeout(() => {
      this.showTimer = undefined;
      this.shownAt = Date.now();
      this.visibleSignal.set(true);
    }, 200);
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
}
