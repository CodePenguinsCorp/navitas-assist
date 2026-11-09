import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LoadingService } from '../../core/services/loading.service';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';
import { LoadingOverlayComponent } from '../loading-overlay/loading-overlay.component';
import { ModalFocusDirective, modalFocusOwnsReturn } from './modal-focus.directive';

@Component({
  imports: [ModalFocusDirective, CustomSelectComponent, LoadingOverlayComponent],
  template: `
    <div class="loading-root"><app-loading-overlay /></div>
    <div class="page">
      <aside class="background"><button type="button" class="outside">Fora</button></aside>
      <aside class="preinert" inert><button type="button">Já inerte</button></aside>
      <button type="button" class="trigger" (click)="open.set(true)">Abrir</button>
      <button type="button" class="fallback" #fallbackButton>Página</button>
      <button type="button" class="empty-trigger" (click)="empty.set(true)">Vazio</button>

      @if (open()) {
        <div class="modal-overlay parent-overlay">
          <section
            class="parent-panel"
            role="dialog"
            appModalFocus
            [modalInitialFocus]="initial()"
            [modalCloseBlocked]="blocked()"
            [modalFallbackFocus]="fallbackButton"
            (modalCloseRequested)="parentRequests = parentRequests + 1"
          >
            <h3>Título</h3>
            <input class="first" />
            <input class="hidden-field" hidden />
            <input class="styled-hidden" style="display: none" />
            <div aria-hidden="true"><button type="button" class="aria-hidden-button">Oculto</button></div>
            <div inert><button type="button" class="inert-button">Inerte</button></div>
            <button type="button" class="negative" tabindex="-1">Programático</button>
            <fieldset disabled><input class="fieldset-disabled" /></fieldset>
            <button type="button" class="disabled-button" disabled>Desabilitado</button>
            <input type="hidden" class="hidden-input" />
            <input class="popover-like" (keydown.escape)="$event.preventDefault()" />
            <app-custom-select class="select" [options]="options" />
            <button type="button" class="child-trigger" (click)="child.set(true)">Filho</button>
            <button type="button" class="second-trigger" (click)="second.set(true)">Segundo</button>
            <button type="button" class="native-trigger" (click)="nativeDialog.openNative()">Nativo</button>
            <button type="button" class="last">Último</button>

            @if (child()) {
              <div class="modal-overlay child-overlay">
                <section class="child-panel" role="dialog" appModalFocus (modalCloseRequested)="childRequests = childRequests + 1">
                  <button type="button" class="child-a">A</button>
                  <button type="button" class="child-b">B</button>
                </section>
              </div>
            }

            <dialog
              class="native"
              appModalFocus
              #nativeDialog="appModalFocus"
              [modalCloseBlocked]="nativeBlocked()"
              (modalCloseRequested)="nativeRequests = nativeRequests + 1"
            >
              <button type="button" class="native-button">Nativo</button>
            </dialog>
          </section>
        </div>
      }

      @if (second()) {
        <div class="modal-overlay second-overlay">
          <section class="second-panel" role="dialog" appModalFocus [modalFallbackFocus]="fallbackButton">
            <button type="button" class="second-a">Segundo A</button>
            <button type="button" class="second-b">Segundo B</button>
          </section>
        </div>
      }

      @if (empty()) {
        <div class="modal-overlay empty-overlay">
          <section class="empty-panel" role="dialog" appModalFocus><p>Sem campos</p></section>
        </div>
      }
    </div>
  `
})
class ModalHost {
  readonly open = signal(false);
  readonly child = signal(false);
  readonly second = signal(false);
  readonly empty = signal(false);
  readonly blocked = signal(false);
  readonly nativeBlocked = signal(false);
  readonly initial = signal<string | null>('.first');
  readonly options = [{ value: 'a', label: 'Alfa' }, { value: 'b', label: 'Beta' }];
  parentRequests = 0;
  childRequests = 0;
  nativeRequests = 0;
}

describe('ModalFocusDirective', () => {
  let fixture: ComponentFixture<ModalHost>;
  let host: ModalHost;
  let page: HTMLElement;
  let loading: LoadingService;

  beforeEach(async () => {
    document.body.style.overflow = 'scroll';
    await TestBed.configureTestingModule({ imports: [ModalHost] }).compileComponents();
    fixture = TestBed.createComponent(ModalHost);
    host = fixture.componentInstance;
    page = fixture.nativeElement;
    loading = TestBed.inject(LoadingService);
    render();
    expect(page.isConnected, 'the fixture must be attached to document.body').toBe(true);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    expect(document.body.style.overflow, 'teardown restores the preexisting overflow').toBe('scroll');
    expect(modalFocusOwnsReturn(), 'teardown leaves no modal registered').toBe(false);
    document.body.style.overflow = '';
  });

  function render(): void {
    fixture.detectChanges();
    TestBed.tick();
  }

  function el<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = page.querySelector<T>(selector);
    expect(found, selector + ' must exist').not.toBeNull();
    return found!;
  }

  function openParent(): HTMLButtonElement {
    const trigger = el<HTMLButtonElement>('.trigger');
    trigger.focus();
    trigger.click();
    render();
    return trigger;
  }

  function press(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
    const target = (document.activeElement as HTMLElement | null) ?? document.body;
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    render();
    return event;
  }

  function showLoading(): void {
    vi.useFakeTimers();
    loading.start();
    vi.advanceTimersByTime(200);
    render();
    expect(loading.visible()).toBe(true);
  }

  function hideLoading(): void {
    loading.finish();
    vi.advanceTimersByTime(400);
    render();
    expect(loading.visible()).toBe(false);
  }

  function nativeDirective(): ModalFocusDirective {
    return fixture.debugElement.query(By.css('dialog.native')).injector.get(ModalFocusDirective);
  }

  describe('focus cycle', () => {
    it('focuses the initial selector after render and makes the panel a programmatic target', () => {
      openParent();
      expect(document.activeElement).toBe(el('.first'));
      expect(el('.parent-panel').getAttribute('tabindex')).toBe('-1');
    });

    it('focuses the panel itself when no initial selector is given', () => {
      host.initial.set(null);
      openParent();
      expect(document.activeElement).toBe(el('.parent-panel'));
    });

    it('wraps Tab from the last control to the first and Shift+Tab from the first to the last', () => {
      openParent();
      el('.last').focus();
      const forward = press('Tab');
      expect(forward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(el('.first'));
      const backward = press('Tab', { shiftKey: true });
      expect(backward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(el('.last'));
    });

    it('skips hidden, inert, aria-hidden, negative tabindex, disabled, fieldset-disabled controls and listbox options', () => {
      openParent();
      const visited: Element[] = [];
      for (let step = 0; step < 8; step++) {
        press('Tab');
        visited.push(document.activeElement!);
      }
      const names = visited.map((item) => item.className.split(' ')[0]);
      expect(names).toEqual([
        'popover-like',
        'custom-select__trigger',
        'child-trigger',
        'second-trigger',
        'native-trigger',
        'last',
        'first',
        'popover-like'
      ]);
      expect(page.querySelector('.parent-panel [role="option"]')).toBeNull();
    });

    it('keeps focus on the panel when it has no focusable controls', () => {
      const trigger = el<HTMLButtonElement>('.empty-trigger');
      trigger.focus();
      trigger.click();
      render();
      expect(document.activeElement).toBe(el('.empty-panel'));
      const event = press('Tab');
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(el('.empty-panel'));
    });

    it('brings focus that lands outside the top dialog back inside it', () => {
      openParent();
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      if (document.activeElement === outside) outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      render();
      expect(el('.parent-panel').contains(document.activeElement)).toBe(true);
      outside.remove();
    });

    it('leaves Tab inside an open select to the select and never cycles into its options', () => {
      openParent();
      const trigger = el<HTMLButtonElement>('.select .custom-select__trigger');
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      render();
      const option = document.activeElement as HTMLElement;
      expect(option.getAttribute('role')).toBe('option');
      const tab = press('Tab');
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(trigger);
      expect(page.querySelector('.select .custom-select__menu')).toBeNull();
      press('Tab');
      expect(document.activeElement).toBe(el('.child-trigger'));
    });
  });

  describe('Escape', () => {
    it('requests closing from the top dialog only', () => {
      openParent();
      const event = press('Escape');
      expect(event.defaultPrevented).toBe(true);
      expect(host.parentRequests).toBe(1);
    });

    it('ignores Escape consumed by a popover', () => {
      openParent();
      el('.popover-like').focus();
      press('Escape');
      expect(host.parentRequests).toBe(0);
    });

    it('ignores Escape consumed by an open custom select', () => {
      openParent();
      const trigger = el<HTMLButtonElement>('.select .custom-select__trigger');
      trigger.focus();
      trigger.click();
      render();
      expect(page.querySelector('.select .custom-select__menu')).not.toBeNull();
      press('Escape');
      expect(host.parentRequests).toBe(0);
      expect(page.querySelector('.select .custom-select__menu')).toBeNull();
    });

    it('ignores Escape while a write keeps closing blocked', () => {
      openParent();
      host.blocked.set(true);
      render();
      const event = press('Escape');
      expect(event.defaultPrevented).toBe(false);
      expect(host.parentRequests).toBe(0);
    });
  });

  describe('background and scroll', () => {
    it('makes background branches inert without aria-hidden and locks scrolling until the last modal leaves', () => {
      const trigger = openParent();
      expect(el('.background').inert).toBe(true);
      expect(trigger.closest('[inert]')).not.toBeNull();
      expect(el('.parent-overlay').closest('[inert]')).toBeNull();
      const hidden = Array.from(document.querySelectorAll('[aria-hidden="true"]')).filter((item) => !el('.parent-panel').contains(item));
      expect(hidden, 'the background is never hidden from assistive technology').toEqual([]);
      expect(el('.loading-root').closest('[inert]')).toBeNull();
      expect(document.body.style.overflow).toBe('hidden');
      host.open.set(false);
      render();
      expect(el('.background').inert).toBe(false);
      expect(el('.preinert').inert, 'preexisting inert is preserved').toBe(true);
      expect(document.body.style.overflow).toBe('scroll');
    });
  });

  describe('closing and returning focus', () => {
    it('returns focus to the connected trigger after the background is restored', () => {
      const trigger = openParent();
      let inertWhenFocused: boolean | null = null;
      trigger.addEventListener('focus', () => (inertWhenFocused = trigger.closest('[inert]') !== null));
      host.open.set(false);
      render();
      expect(document.activeElement).toBe(trigger);
      expect(inertWhenFocused).toBe(false);
    });

    it('falls back to the page target when the trigger was removed', () => {
      const trigger = openParent();
      trigger.remove();
      host.open.set(false);
      render();
      expect(document.activeElement).toBe(el('.fallback'));
    });
  });

  describe('stack', () => {
    it('lets only the child process keys and returns to the parent without releasing its background', () => {
      openParent();
      const childTrigger = el<HTMLButtonElement>('.child-trigger');
      childTrigger.focus();
      childTrigger.click();
      render();
      expect(document.activeElement).toBe(el('.child-panel'));
      expect(el('.first').closest('[inert]'), 'the parent content is background for the child').not.toBeNull();
      expect(el('.child-panel').closest('[inert]')).toBeNull();
      el('.child-b').focus();
      press('Tab');
      expect(document.activeElement).toBe(el('.child-a'));
      press('Escape');
      expect(host.childRequests).toBe(1);
      expect(host.parentRequests).toBe(0);
      host.child.set(false);
      render();
      expect(document.activeElement).toBe(childTrigger);
      expect(el('.first').closest('[inert]')).toBeNull();
      expect(el('.background').inert).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('keeps the remaining dialog coordinated when an older one closes first', () => {
      openParent();
      const secondTrigger = el<HTMLButtonElement>('.second-trigger');
      secondTrigger.focus();
      secondTrigger.click();
      render();
      expect(el('.parent-overlay').inert).toBe(true);
      host.open.set(false);
      render();
      expect(el('.second-panel').contains(document.activeElement)).toBe(true);
      expect(el('.background').inert).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
      el('.second-b').focus();
      press('Tab');
      expect(document.activeElement).toBe(el('.second-a'));
      host.second.set(false);
      render();
      expect(document.activeElement, 'the removed trigger falls back to the page').toBe(el('.fallback'));
      expect(el('.background').inert).toBe(false);
      expect(document.body.style.overflow).toBe('scroll');
    });
  });

  describe('native dialog', () => {
    it('registers and captures the trigger before showModal, then closes back to it', () => {
      openParent();
      const nativeTrigger = el<HTMLButtonElement>('.native-trigger');
      nativeTrigger.focus();
      const dialog = el<HTMLDialogElement>('dialog.native');
      const original = dialog.showModal.bind(dialog);
      vi.spyOn(dialog, 'showModal').mockImplementation(() => {
        original();
        // The browser moves focus into the dialog while showModal runs.
        const inner = el('.native-button');
        inner.focus();
        inner.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      });
      nativeTrigger.click();
      render();
      expect(dialog.open).toBe(true);
      expect(dialog.contains(document.activeElement)).toBe(true);
      nativeDirective().closeNative();
      render();
      expect(dialog.open).toBe(false);
      expect(document.activeElement).toBe(nativeTrigger);
    });

    it('requests closing on cancel with the same guard and leaves the parent overlay alone', () => {
      openParent();
      el<HTMLButtonElement>('.native-trigger').click();
      render();
      el('.native-button').focus();
      press('Escape');
      expect(host.parentRequests, 'the overlay below does not handle Escape').toBe(0);
      const tab = press('Tab');
      expect(tab.defaultPrevented, 'native Tab order is used without another trap').toBe(false);
      const dialog = el<HTMLDialogElement>('dialog.native');
      const cancel = new Event('cancel', { cancelable: true });
      dialog.dispatchEvent(cancel);
      expect(cancel.defaultPrevented).toBe(true);
      expect(host.nativeRequests).toBe(1);
      host.nativeBlocked.set(true);
      render();
      const blockedCancel = new Event('cancel', { cancelable: true });
      dialog.dispatchEvent(blockedCancel);
      expect(blockedCancel.defaultPrevented).toBe(true);
      expect(host.nativeRequests).toBe(1);
    });

    it('closing the native child keeps the parent registered and its background inert', () => {
      openParent();
      el<HTMLButtonElement>('.native-trigger').click();
      render();
      const dialog = el<HTMLDialogElement>('dialog.native');
      dialog.close();
      dialog.dispatchEvent(new Event('close'));
      render();
      expect(el('.background').inert).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
      expect(modalFocusOwnsReturn()).toBe(true);
      press('Escape');
      expect(host.parentRequests).toBe(1);
    });
  });

  describe('global loading', () => {
    it('keeps the global status exposed while a dialog is open', () => {
      openParent();
      showLoading();
      const statuses = page.querySelectorAll('[role="status"]');
      expect(statuses).toHaveLength(1);
      expect(statuses[0].closest('[inert], [aria-hidden="true"]')).toBeNull();
      hideLoading();
    });

    it('ignores Escape, Tab and outside focus while the overlay is visible', () => {
      openParent();
      el('.last').focus();
      showLoading();
      expect(press('Escape').defaultPrevented).toBe(false);
      expect(host.parentRequests).toBe(0);
      expect(press('Tab').defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(el('.last'));
      hideLoading();
    });

    it('returns focus to the trigger only after the overlay hides, exactly once', () => {
      const trigger = openParent();
      showLoading();
      const focus = vi.spyOn(trigger, 'focus');
      host.open.set(false);
      render();
      expect(focus).not.toHaveBeenCalled();
      expect(modalFocusOwnsReturn(), 'the pending return belongs to the dialog').toBe(true);
      hideLoading();
      expect(focus).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(trigger);
      expect(modalFocusOwnsReturn()).toBe(false);
    });

    it('uses the fallback when the trigger disappears during the overlay', () => {
      const trigger = openParent();
      showLoading();
      host.open.set(false);
      render();
      trigger.remove();
      hideLoading();
      expect(document.activeElement).toBe(el('.fallback'));
    });

    it('defers the initial focus of a dialog opened under the overlay', () => {
      el('.trigger').focus();
      showLoading();
      host.open.set(true);
      render();
      expect(document.activeElement).not.toBe(el('.first'));
      hideLoading();
      expect(document.activeElement).toBe(el('.first'));
    });

    it('restores the control focused inside the dialog when the overlay hides', () => {
      openParent();
      el('.last').focus();
      showLoading();
      el('.last').blur();
      hideLoading();
      expect(document.activeElement).toBe(el('.last'));
    });
  });
});
