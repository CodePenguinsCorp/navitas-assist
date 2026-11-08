import { Component, DestroyRef, ElementRef, WritableSignal, computed, inject, input, signal } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';

/** Visual distance between button and tooltip; the tooltip's ::before bridges it for the pointer. */
const TIP_GAP = 6;
const VIEWPORT_MARGIN = 8;
const TIP_MAX_WIDTH = 280;

let nextTipId = 0;

interface TipPosition {
  top: number;
  left: number;
  maxWidth: number;
  below: boolean;
}

/**
 * Icon-only row action (edit, delete). The accessible name carries the record,
 * and the tooltip opens on hover and focus in a fixed layer so the table's
 * horizontal scroll does not clip it. The tooltip stays open while the button
 * is hovered or focused (including the pointer resting on the tooltip itself)
 * and Escape dismisses it from anywhere on the page.
 * Clicks on the button are never intercepted: business guards stay in the
 * page, and the consumer's [disabled] keeps working.
 */
@Component({
  selector: 'button[appRowAction]',
  imports: [IconComponent],
  host: {
    type: 'button',
    class: 'icon-button row-action',
    '[attr.aria-label]': 'accessibleName()',
    '[class.icon-button--danger]': "tone() === 'danger'",
    '[attr.aria-disabled]': "blockedReason() ? 'true' : null",
    '[attr.aria-describedby]': 'blockedReason() ? tipId : null',
    '(mouseenter)': 'onPointerEnter()',
    '(mouseleave)': 'onPointerLeave($event)',
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()',
    '(window:resize)': 'close()'
  },
  template: `
    <app-icon [name]="icon()" />
    <span
      class="row-action__tip"
      role="tooltip"
      [id]="tipId"
      [class.is-open]="tipPosition() !== null"
      [class.row-action__tip--below]="tipPosition()?.below"
      [style.top.px]="tipPosition()?.top"
      [style.left.px]="tipPosition()?.left"
      [style.max-width.px]="tipPosition()?.maxWidth"
      (click)="$event.stopPropagation()"
    >{{ blockedReason() ?? label() }}</span>
  `
})
export class RowActionComponent {
  private readonly hostElement: ElementRef<HTMLButtonElement> = inject(ElementRef);

  readonly icon = input.required<IconName>();
  /** Visible tooltip text and start of the accessible name: 'Editar', 'Excluir', 'Excluindo...'. */
  readonly label = input.required<string>();
  /** Record name appended to the accessible name. */
  readonly target = input('');
  readonly tone = input<'default' | 'danger'>('default');
  /** When set, the action is announced as unavailable and the tooltip explains why. */
  readonly blockedReason = input<string | null>(null);

  protected readonly tipId = `row-action-tip-${++nextTipId}`;
  protected readonly tipPosition: WritableSignal<TipPosition | null> = signal(null);
  protected readonly accessibleName = computed(() => {
    const target = this.target().trim();
    return target ? `${this.label()} ${target}` : this.label();
  });

  private hovered = false;
  private focused = false;
  private readonly onDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close();
  };

  constructor() {
    const onAnyScroll = () => this.close();
    document.addEventListener('scroll', onAnyScroll, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('scroll', onAnyScroll, true);
      document.removeEventListener('keydown', this.onDocumentKeydown);
    });
  }

  protected onPointerEnter(): void {
    this.hovered = true;
    this.open();
  }

  protected onPointerLeave(event: MouseEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.hostElement.nativeElement.contains(next)) return;
    this.hovered = false;
    if (!this.focused) this.close();
  }

  protected onFocus(): void {
    this.focused = true;
    this.open();
  }

  protected onBlur(): void {
    this.focused = false;
    if (!this.hovered) this.close();
  }

  protected close(): void {
    if (this.tipPosition() === null) return;
    this.tipPosition.set(null);
    document.removeEventListener('keydown', this.onDocumentKeydown);
  }

  private open(): void {
    const button = this.hostElement.nativeElement;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxWidth = Math.min(TIP_MAX_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
    const box = button.querySelector<HTMLElement>('.row-action__tip')?.getBoundingClientRect();
    const tipWidth = box && box.width > 0 ? Math.min(box.width, maxWidth) : maxWidth;
    const tipHeight = box?.height ?? 0;

    const roomAbove = rect.top - TIP_GAP - VIEWPORT_MARGIN;
    const roomBelow = viewportHeight - rect.bottom - TIP_GAP - VIEWPORT_MARGIN;
    const below = tipHeight > roomAbove && (tipHeight <= roomBelow || roomBelow > roomAbove);
    const preferredTop = below ? rect.bottom + TIP_GAP : rect.top - TIP_GAP - tipHeight;
    const top = Math.max(Math.min(preferredTop, viewportHeight - tipHeight - VIEWPORT_MARGIN), VIEWPORT_MARGIN);
    const left = Math.min(
      Math.max(rect.right - tipWidth, VIEWPORT_MARGIN),
      viewportWidth - tipWidth - VIEWPORT_MARGIN
    );

    if (this.tipPosition() === null) document.addEventListener('keydown', this.onDocumentKeydown);
    this.tipPosition.set({ top, left: Math.max(left, VIEWPORT_MARGIN), maxWidth, below });
  }
}
