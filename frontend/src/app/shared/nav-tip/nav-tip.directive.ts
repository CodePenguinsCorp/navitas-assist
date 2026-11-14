import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

/** Gap between the item and the tip. */
const TIP_GAP = 10;

/**
 * Same dark tooltip as the row actions (`.row-action__tip`), for items in the collapsed sidebar rail.
 * The tip sits in a fixed layer beside the item, so the rail's overflow never clips it. A null text shows nothing.
 */
@Directive({
  selector: '[appNavTip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focus)': 'show()',
    '(blur)': 'hide()',
    '(click)': 'hide()',
    '(keydown.escape)': 'hide()'
  }
})
export class NavTipDirective {
  readonly appNavTip = input<string | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private tip: HTMLElement | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.hide());
  }

  protected show(): void {
    const text = this.appNavTip();
    if (!text || this.tip) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const tip = document.createElement('span');
    tip.className = 'row-action__tip is-open nav-tip';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-hidden', 'true');
    tip.textContent = text;
    tip.style.left = `${rect.right + TIP_GAP}px`;
    tip.style.top = `${rect.top + rect.height / 2}px`;
    tip.style.transform = 'translateY(-50%)';
    tip.style.pointerEvents = 'none';
    this.host.nativeElement.appendChild(tip);
    this.tip = tip;
  }

  protected hide(): void {
    this.tip?.remove();
    this.tip = null;
  }
}
