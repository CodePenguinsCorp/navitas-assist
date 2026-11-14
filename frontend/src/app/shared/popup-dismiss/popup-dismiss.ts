import { DestroyRef, ElementRef, inject } from '@angular/core';

/** Handle a floating popup reports its state through. */
export interface PopupDismiss {
  /** The popup opened: any other open popup that does not contain this one closes. */
  opened(): void;
  /** The popup closed (by any path). */
  closed(): void;
}

interface OpenPopup {
  readonly host: HTMLElement;
  readonly close: () => void;
}

/** Popups open right now; more than one only when one sits inside another. */
const openPopups: OpenPopup[] = [];

/**
 * Shared dismissal of floating popups (selects, calendar, suggestions, the bell panel):
 * a press or a focus move outside the host closes it, and opening one closes the others.
 * Listens in the capture phase, so a modal panel that stops click propagation does not
 * keep a menu open. Esc stays with each popup, which also returns focus to its trigger.
 * Call it in an injection context; `close` must be safe to call when already closed.
 */
export function popupDismiss(close: () => void, host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement): PopupDismiss {
  const self: OpenPopup = { host, close };
  const forget = () => {
    const index = openPopups.indexOf(self);
    if (index >= 0) openPopups.splice(index, 1);
  };
  const outside = (event: Event) => {
    if (!openPopups.includes(self)) return;
    const target = event.target;
    if (target instanceof Node && host.contains(target)) return;
    // A press on a non-focusable spot of the popup hands focus to a focusable ancestor (a modal panel): still inside.
    if (event.type === 'focusin' && target instanceof Node && target.contains(host)) return;
    forget();
    close();
  };
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('focusin', outside, true);
  inject(DestroyRef).onDestroy(() => {
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('focusin', outside, true);
    forget();
  });
  return {
    opened() {
      for (const popup of [...openPopups]) {
        if (popup !== self && !popup.host.contains(host)) {
          openPopups.splice(openPopups.indexOf(popup), 1);
          popup.close();
        }
      }
      if (!openPopups.includes(self)) openPopups.push(self);
    },
    closed: forget
  };
}
