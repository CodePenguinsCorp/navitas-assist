import {
  DestroyRef,
  Directive,
  ElementRef,
  EnvironmentInjector,
  HostListener,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  untracked
} from '@angular/core';
import { LoadingService } from '../../core/services/loading.service';

/** Elements that can never be background: the global loading blocker and its status. */
const GLOBAL_LOADING = 'app-loading-overlay, .global-loading-dialog';
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META']);
const CANDIDATES =
  'a[href], area[href], button, input, select, textarea, iframe, summary, [tabindex], [contenteditable]:not([contenteditable="false"])';
const OPEN_POPOVER = '.custom-select.is-open, .date-picker.is-open, [aria-haspopup][aria-expanded="true"]';

interface PendingReturn {
  readonly trigger: HTMLElement | null;
  readonly fallback: HTMLElement | null;
}

/** Private stack shared by every participant in this module. */
const stack: ModalFocusDirective[] = [];
const appliedInert = new Map<HTMLElement, boolean>();
let savedOverflow: string | null = null;
let pendingReturn: PendingReturn | null = null;

/**
 * True while a dialog is open or a dialog focus return is still waiting for the global overlay.
 * The root only restores its own saved focus when this is false, so each return has one owner.
 */
export function modalFocusOwnsReturn(): boolean {
  return stack.length > 0 || pendingReturn !== null;
}

/**
 * Coordinates focus, background inertness and scroll locking for overlay dialogs and,
 * through openNative/closeNative, for native `<dialog>` hosts opened with showModal().
 */
@Directive({
  selector: '[appModalFocus]',
  exportAs: 'appModalFocus'
})
export class ModalFocusDirective {
  readonly modalCloseBlocked = input(false);
  readonly modalInitialFocus = input<string | null>(null);
  readonly modalFallbackFocus = input<HTMLElement | null>(null);
  readonly modalCloseRequested = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly loading = inject(LoadingService);
  private readonly injector = inject(Injector);
  private readonly environment = inject(EnvironmentInjector);
  private readonly isNative = this.host instanceof HTMLDialogElement;
  private trigger: HTMLElement | null = null;
  /** Focus to apply once the global overlay hides: the initial target or a control to restore. */
  private deferredFocus: 'initial' | HTMLElement | null = null;
  private destroyed = false;

  constructor() {
    if (!this.host.hasAttribute('tabindex')) this.host.setAttribute('tabindex', '-1');

    effect(() => {
      const visible = this.loading.visible();
      untracked(() => (visible ? this.onLoadingShown() : this.onLoadingHidden()));
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.unregister();
    });

    if (!this.isNative) {
      this.register();
      afterNextRender(() => this.focusInitialOrDefer(), { injector: this.injector });
    }
  }

  /** Native host only: register and capture the trigger before the browser moves focus. */
  openNative(): void {
    const dialog = this.host as HTMLDialogElement;
    if (!this.isNative || dialog.open) return;
    this.register();
    dialog.showModal();
    this.focusInitialOrDefer();
  }

  closeNative(): void {
    if (!this.isNative) return;
    this.unregister();
    const dialog = this.host as HTMLDialogElement;
    if (dialog.open) dialog.close();
  }

  @HostListener('close')
  protected onNativeClose(): void {
    if (this.isNative) this.unregister();
  }

  @HostListener('cancel', ['$event'])
  protected onNativeCancel(event: Event): void {
    if (!this.isNative) return;
    event.preventDefault();
    if (!this.modalCloseBlocked() && !this.loading.visible()) this.modalCloseRequested.emit();
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (!this.isTop() || this.isNative || event.defaultPrevented || this.loading.visible()) return;
    if (event.key === 'Escape') this.handleEscape(event);
    else if (event.key === 'Tab') this.cycle(event);
  }

  @HostListener('document:focusin', ['$event'])
  protected onFocusIn(event: FocusEvent): void {
    if (!this.isTop() || this.isNative || this.loading.visible()) return;
    const target = event.target;
    if (!(target instanceof Node) || this.host.contains(target)) return;
    if (target instanceof Element && target.closest(GLOBAL_LOADING)) return;
    (focusableWithin(this.host)[0] ?? this.host).focus({ preventScroll: true });
  }

  private handleEscape(event: KeyboardEvent): void {
    if (this.modalCloseBlocked() || this.host.querySelector(OPEN_POPOVER)) return;
    event.preventDefault();
    this.modalCloseRequested.emit();
  }

  /** Recomputes the cycle on every Tab so hidden or disabled controls never receive focus. */
  private cycle(event: KeyboardEvent): void {
    event.preventDefault();
    const items = focusableWithin(this.host);
    if (items.length === 0) {
      this.host.focus({ preventScroll: true });
      return;
    }
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = index === -1
      ? (event.shiftKey ? items[items.length - 1] : items[0])
      : items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length];
    next.focus();
  }

  private isTop(): boolean {
    return stack[stack.length - 1] === this;
  }

  private register(): void {
    if (stack.includes(this)) return;
    const active = document.activeElement;
    this.trigger = active instanceof HTMLElement && active !== document.body && !active.closest(GLOBAL_LOADING) ? active : null;
    // A new dialog takes over focus; an older pending return is no longer meaningful.
    pendingReturn = null;
    if (stack.length === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    stack.push(this);
    syncBackground();
  }

  private unregister(): void {
    const index = stack.indexOf(this);
    if (index === -1) return;
    const wasTop = index === stack.length - 1;
    stack.splice(index, 1);
    this.deferredFocus = null;
    syncBackground();
    if (stack.length === 0 && savedOverflow !== null) {
      document.body.style.overflow = savedOverflow;
      savedOverflow = null;
    }
    if (!wasTop) return;

    const request: PendingReturn = { trigger: this.trigger, fallback: this.modalFallbackFocus() };
    this.trigger = null;
    if (this.loading.visible()) {
      pendingReturn = request;
      scheduleReturnAfterLoading(this.loading, this.environment);
    } else {
      returnFocus(request);
    }
  }

  private focusInitialOrDefer(): void {
    if (this.destroyed || !stack.includes(this)) return;
    // The host is attached to the document only after its view renders: update branches before focusing.
    syncBackground();
    if (this.loading.visible()) {
      this.deferredFocus = 'initial';
      return;
    }
    this.focusInitial();
  }

  private focusInitial(): void {
    const selector = this.modalInitialFocus();
    const target = selector ? this.host.querySelector<HTMLElement>(selector) : null;
    (target && isFocusable(target) ? target : this.host).focus({ preventScroll: true });
  }

  private onLoadingShown(): void {
    if (!this.isTop() || this.deferredFocus) return;
    const active = document.activeElement;
    this.deferredFocus = active instanceof HTMLElement && this.host.contains(active) ? active : this.host;
  }

  private onLoadingHidden(): void {
    // Runs after the root has released its own inert content in the same render.
    afterNextRender(() => {
      flushPendingReturn();
      this.applyDeferredFocus();
    }, { injector: this.injector });
  }

  private applyDeferredFocus(): void {
    const deferred = this.deferredFocus;
    this.deferredFocus = null;
    if (!deferred || this.destroyed || !this.isTop() || this.loading.visible()) return;
    if (deferred === 'initial') this.focusInitial();
    else (isFocusable(deferred) && this.host.contains(deferred) ? deferred : this.host).focus({ preventScroll: true });
  }

  /** @internal Used by the stack to compute background branches. */
  get element(): HTMLElement {
    return this.host;
  }

  /** @internal */
  get native(): boolean {
    return this.isNative;
  }
}

function scheduleReturnAfterLoading(loading: LoadingService, environment: EnvironmentInjector): void {
  const watcher = effect(() => {
    if (loading.visible()) return;
    untracked(() => {
      watcher.destroy();
      // After render so the root has already removed its own inert/blocker.
      afterNextRender(() => flushPendingReturn(), { injector: environment });
    });
  }, { injector: environment, manualCleanup: true });
}

function flushPendingReturn(): void {
  const request = pendingReturn;
  if (!request) return;
  pendingReturn = null;
  returnFocus(request);
}

/** Trigger if still usable, otherwise the dialog below, otherwise the page fallback. */
function returnFocus(request: PendingReturn): void {
  const top = stack[stack.length - 1] ?? null;
  const { trigger, fallback } = request;
  if (trigger && isFocusable(trigger) && (!top || top.element.contains(trigger))) {
    trigger.focus({ preventScroll: true });
  } else if (top) {
    top.element.focus({ preventScroll: true });
  } else if (fallback && isFocusable(fallback)) {
    fallback.focus({ preventScroll: true });
  }
}

/**
 * Makes every branch outside the highest overlay dialog inert, restoring previous values.
 * Native dialogs opened above it keep their own branch: an inert ancestor would disable them.
 */
function syncBackground(): void {
  const ownerIndex = stack.map((entry) => !entry.native).lastIndexOf(true);
  const owner = ownerIndex === -1 ? null : stack[ownerIndex];
  const nativeAbove = stack.slice(ownerIndex + 1).map((entry) => entry.element);
  const desired = new Set<HTMLElement>();
  let node: HTMLElement | null = owner?.element ?? null;
  while (node && node !== document.body && node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || SKIPPED_TAGS.has(sibling.tagName)) continue;
      if (sibling.matches(GLOBAL_LOADING) || sibling.querySelector(GLOBAL_LOADING)) continue;
      if (nativeAbove.some((element) => sibling.contains(element))) continue;
      desired.add(sibling);
    }
    node = node.parentElement;
  }

  for (const [element, previous] of appliedInert) {
    if (desired.has(element)) continue;
    element.inert = previous;
    appliedInert.delete(element);
  }
  for (const element of desired) {
    if (appliedInert.has(element)) continue;
    appliedInert.set(element, element.inert);
    element.inert = true;
  }
}

function focusableWithin(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(CANDIDATES)).filter(
    (element) => isTabbable(element) && isFocusable(element, panel)
  );
}

function isTabbable(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
  const tabindex = element.getAttribute('tabindex');
  if (tabindex !== null && Number(tabindex) < 0) return false;
  return element.getAttribute('role') !== 'option' && !element.closest('[role="listbox"]');
}

/** Connected, enabled, visible and outside inert/hidden branches (up to `boundary`). */
function isFocusable(element: HTMLElement, boundary: HTMLElement | null = null): boolean {
  if (!element.isConnected) return false;
  if ('disabled' in element && (element as HTMLButtonElement).disabled) return false;
  if (insideDisabledFieldset(element)) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.inert || node.hidden || node.getAttribute('aria-hidden') === 'true') {
      // The dialog host is a valid programmatic target even if a caller marked a wrapper.
      if (node !== boundary) return false;
    }
    const style = getComputedStyle(node);
    if (style.display === 'none' || (node === element && style.visibility === 'hidden')) return false;
    if (node === boundary) break;
  }
  return true;
}

function insideDisabledFieldset(element: HTMLElement): boolean {
  for (let fieldset = element.closest('fieldset'); fieldset; fieldset = fieldset.parentElement?.closest('fieldset') ?? null) {
    if (!fieldset.disabled) continue;
    const legend = fieldset.querySelector(':scope > legend');
    if (!legend || !legend.contains(element)) return true;
  }
  return false;
}
