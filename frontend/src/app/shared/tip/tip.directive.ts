import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

let nextId = 0;
const GAP = 8;

@Directive({
  selector: '[appTip]',
  host: {
    '(mouseenter)': 'show()', '(mouseleave)': 'hide()',
    '(focusin)': 'show()', '(focusout)': 'hide()',
    '(focus)': 'show()', '(blur)': 'hide()',
    '(click)': 'hide()', '(keydown.escape)': 'hide()', '(document:keydown.escape)': 'hide()',
    '(window:resize)': 'hide()', '(window:scroll)': 'hide()'
  }
})
export class TipDirective {
  readonly appTip = input<string | null | undefined>(null);
  readonly tipPosition = input<'right' | 'top' | 'bottom'>('top');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private tip: HTMLElement | null = null;

  constructor() {
    const element = this.host.nativeElement;
    const needsTabStop = !element.matches('[tabindex]') && !element.closest('button, a[href], input, select, textarea, [aria-hidden="true"]');
    if (needsTabStop) element.setAttribute('tabindex', '0');
    const onScroll = () => this.hide();
    document.addEventListener('scroll', onScroll, true);
    inject(DestroyRef).onDestroy(() => {
      this.hide();
      if (needsTabStop) element.removeAttribute('tabindex');
      document.removeEventListener('scroll', onScroll, true);
    });
  }

  protected show(): void {
    const text = this.appTip();
    if (!text || this.tip) return;
    if (!this.hoverOrKeyboardFocus()) return;
    const element = this.host.nativeElement;
    // A tip that only repeats the visible text is useful solely when that text was cut off ("...").
    if (this.repeatsVisibleText(element, text) && !this.isTruncated(element)) return;
    const rect = element.getBoundingClientRect();
    const tip = document.createElement('span');
    tip.className = 'row-action__tip is-open app-tip';
    tip.id = `app-tip-${++nextId}`;
    tip.setAttribute('role', 'tooltip');
    tip.textContent = text;
    tip.style.pointerEvents = 'none';
    tip.style.maxHeight = `${Math.max(0, innerHeight - GAP * 2)}px`;
    tip.style.overflow = 'hidden';
    document.body.appendChild(tip);
    const { width, height } = tip.getBoundingClientRect();
    let left = rect.left + (rect.width - width) / 2;
    let top = rect.top - height - GAP;
    if (this.tipPosition() === 'right') {
      left = rect.right + GAP;
      if (left + width > innerWidth - GAP) left = rect.left - width - GAP;
      top = rect.top + (rect.height - height) / 2;
    } else if (this.tipPosition() === 'bottom') {
      top = rect.bottom + GAP;
      if (top + height > innerHeight - GAP) top = rect.top - height - GAP;
    } else if (top < GAP) top = rect.bottom + GAP;
    tip.style.left = `${Math.max(GAP, Math.min(left, innerWidth - width - GAP))}px`;
    tip.style.top = `${Math.max(GAP, Math.min(top, innerHeight - height - GAP))}px`;
    element.setAttribute('aria-describedby', [element.getAttribute('aria-describedby'), tip.id].filter(Boolean).join(' '));
    this.tip = tip;
  }

  /** Hover always counts; focus counts only for the keyboard (focus handed back after closing a dialog must not leave the tip stuck). */
  private hoverOrKeyboardFocus(): boolean {
    const element = this.host.nativeElement;
    if (element.matches(':hover')) return true;
    try { return !element.matches(':focus') || element.matches(':focus-visible'); } catch { return true; }
  }

  private repeatsVisibleText(element: HTMLElement, text: string): boolean {
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
    // innerText follows what is actually rendered (a label hidden in the collapsed rail does not count).
    return normalize((element as HTMLElement & { innerText?: string }).innerText ?? element.textContent ?? '') === normalize(text);
  }

  private isTruncated(element: HTMLElement): boolean {
    return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
  }

  protected hide(): void {
    if (!this.tip) return;
    const element = this.host.nativeElement;
    const description = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== this.tip!.id).join(' ');
    this.tip.remove();
    this.tip = null;
    if (description) element.setAttribute('aria-describedby', description);
    else element.removeAttribute('aria-describedby');
  }
}
