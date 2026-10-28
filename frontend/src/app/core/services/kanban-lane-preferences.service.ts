import { Injectable, inject, signal } from '@angular/core';
import { KanbanGroupBy } from '../models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class KanbanLanePreferencesService {
  private readonly auth = inject(AuthService);
  private readonly cache = signal<Record<string, readonly string[]>>({});

  collapsedKeys(groupBy: KanbanGroupBy): readonly string[] {
    const key = this.storageKey(groupBy);
    if (!key) return [];
    const cached = this.cache()[key];
    if (cached) return cached;
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(value) && value.length <= 1000 && value.every(item => typeof item === 'string' && item.length <= 500) ? value : [];
    } catch {
      return [];
    }
  }

  toggle(groupBy: KanbanGroupBy, laneKey: string): void {
    const key = this.storageKey(groupBy);
    if (!key) return;
    const current = this.collapsedKeys(groupBy);
    const next = current.includes(laneKey) ? current.filter(item => item !== laneKey) : [...current, laneKey].slice(-1000);
    this.cache.update(cache => ({ ...cache, [key]: next }));
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Keep the current session usable when browser storage is unavailable.
    }
  }

  private storageKey(groupBy: KanbanGroupBy): string | null {
    const user = this.auth.currentUser();
    return user ? 'navitas.kanban.lanes:' + encodeURIComponent(user.username) + ':' + groupBy : null;
  }
}
