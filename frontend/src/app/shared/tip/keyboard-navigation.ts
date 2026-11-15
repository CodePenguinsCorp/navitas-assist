/**
 * Tells keyboard navigation (Tab, arrows) apart from focus handed back by code, for example to the row action that opened a
 * dialog once it closes with Esc or Enter. Only the first one may open a tip; the second must not leave it stuck.
 */
let navigating = false;

const NAVIGATION_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => {
    navigating = NAVIGATION_KEYS.has(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey;
  }, true);
  document.addEventListener('pointerdown', () => { navigating = false; }, true);
}

/** True when the element got its focus through keyboard navigation. Falls back to true where :focus-visible is unsupported. */
export function focusedByKeyboardNavigation(element: HTMLElement): boolean {
  try { return navigating && element.matches(':focus-visible'); } catch { return true; }
}
