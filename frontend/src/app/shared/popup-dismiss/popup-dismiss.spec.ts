import { Component, ElementRef, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { popupDismiss } from './popup-dismiss';

@Component({
  selector: 'app-test-popup',
  template: `<button type="button" class="trigger" (click)="open()">Abrir</button>@if (isOpen()) { <div class="panel"><span class="plain">Texto</span><button type="button" class="item">Item</button><ng-content /></div> }`
})
class TestPopupComponent {
  readonly isOpen = signal(false);
  readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly dismiss = popupDismiss(() => this.isOpen.set(false));
  open(): void { this.isOpen.set(true); this.dismiss.opened(); }
}

@Component({
  imports: [TestPopupComponent],
  template: `
    <article class="modal" tabindex="-1" (click)="$event.stopPropagation()" (pointerdown)="$event.stopPropagation()">
      <p class="outside" tabindex="-1">Fora</p>
      <app-test-popup class="one"><app-test-popup class="nested" /></app-test-popup>
      <app-test-popup class="two" />
    </article>
  `
})
class HostComponent {}

describe('popupDismiss', () => {
  let fixture: ComponentFixture<HostComponent>;
  let page: HTMLElement;
  const q = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;
  const isOpen = (popup: string) => !!page.querySelector(`.${popup} > .panel`);
  const open = (popup: string) => { q<HTMLButtonElement>(`.${popup} > .trigger`).click(); fixture.detectChanges(); };
  const press = (selector: string) => { q(selector).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); fixture.detectChanges(); };

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  it('closes on a press outside, even under a panel that stops propagation', () => {
    open('one');
    press('.outside');
    expect(isOpen('one')).toBe(false);
  });

  it('stays open on a press inside', () => {
    open('one');
    press('.one .plain');
    expect(isOpen('one')).toBe(true);
  });

  it('closes when focus moves outside, but not when focus falls back to a containing panel', () => {
    open('one');
    q('.modal').focus();
    fixture.detectChanges();
    expect(isOpen('one')).toBe(true);
    q('.outside').focus();
    fixture.detectChanges();
    expect(isOpen('one')).toBe(false);
  });

  it('keeps one popup open at a time, except one nested inside another', () => {
    open('one');
    open('nested');
    expect(isOpen('one')).toBe(true);
    expect(isOpen('nested')).toBe(true);
    open('two');
    expect(isOpen('one')).toBe(false);
    expect(isOpen('two')).toBe(true);
  });
});
