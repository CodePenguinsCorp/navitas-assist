import { Component, computed, input, linkedSignal } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';

const STORAGE_PREFIX = 'navitas.section.';
let nextId = 0;

function readChoice(key: string | null): boolean | null {
  if (!key) return null;
  try {
    const value = localStorage.getItem(STORAGE_PREFIX + key);
    return value === '1' ? true : value === '0' ? false : null;
  } catch {
    return null;
  }
}

function writeChoice(key: string | null, open: boolean): void {
  if (!key) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, open ? '1' : '0');
  } catch {
    // Storage unavailable: the choice just lasts until the page is closed.
  }
}

/**
 * Title row of a `.detail-card` that folds its content. It replaces the card's own heading
 * (it is not a card). Header actions go in `[sectionActions]` and never fold the section.
 */
@Component({
  selector: 'app-collapsible-section',
  imports: [IconComponent],
  templateUrl: './collapsible-section.component.html',
  styleUrl: './collapsible-section.component.css'
})
export class CollapsibleSectionComponent {
  readonly title = input.required<string>();
  /** Small chip beside the title. */
  readonly count = input<number | null>(null);
  readonly icon = input<IconName | null>(null);
  /** Initial state; the user's stored choice (see `storageKey`) wins over it. */
  readonly open = input(true);
  /** Remembers the choice in localStorage as `navitas.section.<key>`. */
  readonly storageKey = input<string | null>(null);

  private readonly uid = `collapsible-section-${nextId++}`;
  protected readonly buttonId = `${this.uid}-button`;
  protected readonly bodyId = `${this.uid}-body`;
  protected readonly expanded = linkedSignal(() => readChoice(this.storageKey()) ?? this.open());
  /** Current state, for hosts that fold several sections together. */
  readonly isOpen = this.expanded.asReadonly();
  protected readonly hasCount = computed(() => this.count() !== null && this.count() !== undefined);

  toggle(): void {
    this.setOpen(!this.expanded());
  }

  setOpen(open: boolean): void {
    this.expanded.set(open);
    writeChoice(this.storageKey(), open);
  }
}
