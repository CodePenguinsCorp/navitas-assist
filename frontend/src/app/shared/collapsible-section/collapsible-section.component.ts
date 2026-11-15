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
 * A box of its own (border, white surface, hover on the whole header row) whose heading folds its content;
 * a `.detail-card` that holds only this component gives up its own box, so stacked sections read as separate.
 * The always-open variant (`collapsible=false`) is only a heading inside the card around it. Header actions go in `[sectionActions]` and never fold the section.
 */
@Component({
  selector: 'app-collapsible-section',
  imports: [IconComponent],
  templateUrl: './collapsible-section.component.html',
  styleUrl: './collapsible-section.component.css',
  // `title` is an input: without this the host would keep it as a native tooltip over the whole section.
  host: { '[attr.title]': 'null', '[class.collapsible-section--static]': '!collapsible()' }
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
  /** False for a section that is always open: same header, no toggle and no arrow. */
  readonly collapsible = input(true);

  private readonly uid = `collapsible-section-${nextId++}`;
  protected readonly buttonId = `${this.uid}-button`;
  protected readonly bodyId = `${this.uid}-body`;
  protected readonly expanded = linkedSignal(() => !this.collapsible() || (readChoice(this.storageKey()) ?? this.open()));
  /** Current state, for hosts that fold several sections together. */
  readonly isOpen = this.expanded.asReadonly();
  protected readonly hasCount = computed(() => this.count() !== null && this.count() !== undefined);

  toggle(): void {
    if (!this.collapsible()) return;
    this.setOpen(!this.expanded());
  }

  /** Click on the empty part of the header row (the button and the actions handle their own clicks). */
  protected toggleFromHeader(event: Event): void {
    if (event.target === event.currentTarget) this.toggle();
  }

  /** A header action (e.g. "Registrar") always shows its result: it unfolds a folded section. */
  protected unfoldForAction(event: Event): void {
    const target = event.target as Element | null;
    if (target?.closest('button:not(:disabled), a[href]')) this.setOpen(true);
  }

  setOpen(open: boolean): void {
    if (!this.collapsible()) return;
    this.expanded.set(open);
    writeChoice(this.storageKey(), open);
  }
}
