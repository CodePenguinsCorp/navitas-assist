import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export interface ToastAction { label: string; run: () => void; }
export interface ToastOptions {
  message: string;
  tone: 'success' | 'info' | 'error';
  actions?: ToastAction[];
  durationMs?: number;
}
export interface Toast extends ToastOptions { id: number; }
type PauseSource = 'pointer' | 'focus';
interface TimerState {
  handle?: ReturnType<typeof setTimeout>;
  remaining: number;
  started: number;
  paused: Set<PauseSource>;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<Toast[]>([]);
  readonly toasts = this.items.asReadonly();
  private sequence = 0;
  private readonly timers = new Map<number, TimerState>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const item of this.items()) this.dismiss(item.id);
    });
  }

  show(options: ToastOptions): number {
    const duplicate = this.items().find(item => item.message === options.message);
    // A repetição substitui ações e vínculo, sem manter callbacks de outra OS.
    if (duplicate) this.dismiss(duplicate.id);
    if (this.items().length === 3) this.dismiss(this.items()[0].id);
    const id = ++this.sequence;
    this.items.update(items => [...items, { ...options, id }]);
    if (options.tone !== 'error') {
      this.timers.set(id, { remaining: options.durationMs ?? (options.actions?.length ? 8000 : 5000), started: 0, paused: new Set() });
      this.start(id);
    }
    return id;
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id)?.handle);
    this.timers.delete(id);
    this.items.update(items => items.filter(item => item.id !== id));
  }

  pause(id: number, source: PauseSource): void {
    const timer = this.timers.get(id);
    if (!timer || timer.paused.has(source)) return;
    if (!timer.paused.size) {
      clearTimeout(timer.handle);
      timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.started));
    }
    timer.paused.add(source);
  }

  resume(id: number, source: PauseSource): void {
    const timer = this.timers.get(id);
    if (timer?.paused.delete(source) && !timer.paused.size) this.start(id);
  }

  private start(id: number): void {
    const timer = this.timers.get(id)!;
    timer.started = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }
}
