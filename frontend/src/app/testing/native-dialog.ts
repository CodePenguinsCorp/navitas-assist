import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { App } from '../app';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Adds to happy-dom what a browser does around a modal `<dialog>` and happy-dom leaves out:
 * showModal() moves focus into the dialog (autofocus, first focusable, or the dialog itself),
 * nothing outside the topmost open modal can take focus, and close() takes focus out of the
 * dialog, back to the element focused before it opened when that one can still receive it.
 * Returns a function that restores the original prototypes.
 */
export function simulateNativeModality(): () => void {
  const dialogProto = HTMLDialogElement.prototype;
  const originalShowModal = dialogProto.showModal;
  const originalClose = dialogProto.close;
  const originalFocus = HTMLElement.prototype.focus;
  const topLayer: { dialog: HTMLDialogElement; previous: Element | null }[] = [];

  const topmost = () => topLayer.filter((entry) => entry.dialog.isConnected && entry.dialog.open).at(-1)?.dialog ?? null;

  dialogProto.showModal = function (this: HTMLDialogElement) {
    const previous = document.activeElement;
    originalShowModal.call(this);
    if (!topLayer.some((entry) => entry.dialog === this)) topLayer.push({ dialog: this, previous });
    const target = this.querySelector<HTMLElement>('[autofocus]') ?? this.querySelector<HTMLElement>(FOCUSABLE) ?? this;
    originalFocus.call(target);
  };

  dialogProto.close = function (this: HTMLDialogElement, returnValue?: string) {
    const index = topLayer.findIndex((entry) => entry.dialog === this);
    const previous = index === -1 ? null : topLayer[index].previous;
    if (index !== -1) topLayer.splice(index, 1);
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.contains(active)) {
      if (previous instanceof HTMLElement && previous.isConnected) originalFocus.call(previous);
      else active.blur();
    }
    originalClose.call(this, returnValue);
  };

  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    const top = topmost();
    if (top && !top.contains(this)) return;
    originalFocus.call(this, options);
  };

  return () => {
    dialogProto.showModal = originalShowModal;
    dialogProto.close = originalClose;
    HTMLElement.prototype.focus = originalFocus;
  };
}

/**
 * Mounts the real root (content wrapper and global loading blocker) with `component` routed
 * at '', as in the running application. Configure the module with provideRouter for that route.
 */
export async function mountUnderRoot(component: Type<unknown>): Promise<{ fixture: ComponentFixture<App>; element: HTMLElement }> {
  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  await TestBed.inject(Router).navigateByUrl('/');
  fixture.detectChanges();
  const page = fixture.debugElement.query(By.directive(component));
  if (!page) throw new Error(`${component.name} must be routed inside the root content.`);
  if (!(fixture.nativeElement as HTMLElement).querySelector('dialog.global-loading-dialog')) {
    throw new Error('The root must render the global loading blocker.');
  }
  return { fixture, element: page.nativeElement as HTMLElement };
}
