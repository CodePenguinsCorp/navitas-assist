import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CustomSelectComponent } from './custom-select/custom-select.component';
import { DatePickerComponent } from './date-picker/date-picker.component';

@Component({
  imports: [ReactiveFormsModule, CustomSelectComponent, DatePickerComponent],
  template: `
    <section (keydown)="parentKeys.push($event.key)">
      <input class="outside" />
      <app-custom-select class="select-a" [options]="options" [formControl]="select" (valueChange)="selectOutputs.push($event)" />
      <app-custom-select class="select-b" [options]="options" [value]="'first'" (valueChange)="standaloneOutputs.push($event)" />
      <app-date-picker class="date-a" [formControl]="date" minDate="2026-06-01" maxDate="2026-06-30" (valueChange)="dateOutputs.push($event)" />
      <app-date-picker class="date-b" [formControl]="secondDate" />
    </section>
  `,
})
class PopoverHost {
  readonly options = [{ value: 'first', label: 'Primeiro' }, { value: 'second', label: 'Segundo' }];
  readonly select = new FormControl('first', { nonNullable: true });
  readonly date = new FormControl('2026-06-15', { nonNullable: true });
  readonly secondDate = new FormControl('2026-06-15', { nonNullable: true });
  readonly selectOutputs: unknown[] = [];
  readonly standaloneOutputs: unknown[] = [];
  readonly dateOutputs: string[] = [];
  readonly parentKeys: string[] = [];
}

const CONTROLS = [
  { name: 'select', root: '.select-a', second: '.select-b', trigger: '.custom-select__trigger', panel: '.custom-select__menu',
    sources: ['.custom-select__trigger', '.custom-select__option'], value: 'first', label: 'Primeiro' },
  { name: 'date', root: '.date-a', second: '.date-b', trigger: '.date-picker__trigger', panel: '.date-picker__panel',
    sources: ['.date-picker__trigger', '.date-picker__day.is-selected', '.date-picker__nav', '.date-picker__footer-action'], value: '2026-06-15', label: '15/06/2026' },
] as const;

describe('Shared popover keyboard dismissal', () => {
  let fixture: ComponentFixture<PopoverHost>;
  let host: PopoverHost;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PopoverHost] }).compileComponents();
    fixture = TestBed.createComponent(PopoverHost);
    host = fixture.componentInstance;
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  function element(selector: string): HTMLButtonElement {
    return page.querySelector(selector)!;
  }

  function open(selector: string): HTMLButtonElement {
    const trigger = element(selector);
    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    return trigger;
  }

  function key(target: HTMLElement, name = 'Escape'): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  for (const definition of CONTROLS) {
    describe(definition.name, () => {
      const triggerSelector = definition.root + ' ' + definition.trigger;
      const panelSelector = definition.root + ' ' + definition.panel;

      for (const source of definition.sources) {
        it('closes on Escape from ' + source + ', restores focus and preserves selection', () => {
          const trigger = open(triggerSelector);
          const control = host[definition.name];
          const changes: string[] = [];
          control.valueChanges.subscribe((value) => changes.push(value));
          const target = element(definition.root + ' ' + source);
          target.focus();
          const event = key(target);

          expect(page.querySelector(panelSelector)).toBeNull();
          expect(trigger.getAttribute('aria-expanded')).toBe('false');
          expect(page.ownerDocument.activeElement).toBe(trigger);
          expect(trigger.textContent).toContain(definition.label);
          expect(control.value).toBe(definition.value);
          expect(control.dirty).toBe(false);
          expect(control.touched).toBe(true);
          expect(changes).toEqual([]);
          expect(host.selectOutputs).toEqual([]);
          expect(host.dateOutputs).toEqual([]);
          expect(host.standaloneOutputs).toEqual([]);
          expect(event.defaultPrevented).toBe(true);
          expect(host.parentKeys).toEqual([]);
        });
      }

      it('lets closed-control Escape reach its parent without marking touched', () => {
        const trigger = element(triggerSelector);
        trigger.focus();
        const event = key(trigger);
        expect(page.querySelector(panelSelector)).toBeNull();
        expect(page.ownerDocument.activeElement).toBe(trigger);
        expect(host[definition.name].touched).toBe(false);
        expect(host[definition.name].value).toBe(definition.value);
        expect(event.defaultPrevented).toBe(false);
        expect(host.parentKeys).toEqual(['Escape']);
      });

      // Moving focus out closes the panel (shared popup dismissal), so these keys come from elsewhere without a focus move.
      it('ignores Escape outside the control without stealing focus', () => {
        open(triggerSelector);
        const outside = element('.outside');
        const focused = page.ownerDocument.activeElement;
        const touched = host[definition.name].touched;
        const event = key(outside);
        expect(page.querySelector(panelSelector)).not.toBeNull();
        expect(page.ownerDocument.activeElement).toBe(focused);
        expect(host[definition.name].touched).toBe(touched);
        expect(host[definition.name].value).toBe(definition.value);
        expect(event.defaultPrevented).toBe(false);
        expect(host.parentKeys).toEqual(['Escape']);
      });

      it('leaves an already-prevented child Escape to its existing handler', () => {
        open(triggerSelector);
        const target = element(definition.root + ' ' + definition.sources[1]);
        target.focus();
        const touched = host[definition.name].touched;
        target.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
        key(target);
        expect(page.querySelector(panelSelector)).not.toBeNull();
        expect(page.ownerDocument.activeElement).toBe(target);
        expect(host[definition.name].touched).toBe(touched);
        expect(host[definition.name].value).toBe(definition.value);
        expect(host.parentKeys).toEqual(['Escape']);
      });

      it('does not consume an unrelated key', () => {
        const trigger = open(triggerSelector);
        const touched = host[definition.name].touched;
        // Arrow keys now move into the select's list, so an ordinary letter is the unrelated key.
        const event = key(trigger, 'x');
        expect(page.querySelector(panelSelector)).not.toBeNull();
        expect(page.ownerDocument.activeElement).toBe(trigger);
        expect(host[definition.name].touched).toBe(touched);
        expect(host[definition.name].value).toBe(definition.value);
        expect(event.defaultPrevented).toBe(false);
        expect(host.parentKeys).toEqual(['x']);
      });

      it('does not react to Escape in another instance of the same control', () => {
        open(triggerSelector);
        const other = element(definition.second + ' ' + definition.trigger);
        const focused = page.ownerDocument.activeElement;
        const touched = host[definition.name].touched;
        const event = key(other);
        expect(page.querySelector(panelSelector)).not.toBeNull();
        expect(page.ownerDocument.activeElement).toBe(focused);
        expect(host[definition.name].touched).toBe(touched);
        expect(event.defaultPrevented).toBe(false);
        expect(host.parentKeys).toEqual(['Escape']);
      });
    });
  }

  it('reopens the select after Escape and emits the next selection once', () => {
    let trigger = open('.select-a .custom-select__trigger');
    key(trigger);
    expect(page.querySelector('.select-a .custom-select__menu')).toBeNull();
    trigger = open('.select-a .custom-select__trigger');
    const options = page.querySelectorAll<HTMLButtonElement>('.select-a .custom-select__option');
    options[1].click();
    fixture.detectChanges();
    expect(host.select.value).toBe('second');
    expect(host.select.dirty).toBe(true);
    expect(host.selectOutputs).toEqual(['second']);
    expect(trigger.textContent).toContain('Segundo');
    expect(page.querySelector('.select-a .custom-select__menu')).toBeNull();
  });

  it('supports the standalone value/valueChange select without changing the value on Escape', () => {
    const trigger = open('.select-b .custom-select__trigger');
    const target = element('.select-b .custom-select__option');
    target.focus();
    const event = key(target);
    expect(page.querySelector('.select-b .custom-select__menu')).toBeNull();
    expect(trigger.textContent).toContain('Primeiro');
    expect(page.ownerDocument.activeElement).toBe(trigger);
    expect(host.standaloneOutputs).toEqual([]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('reopens the calendar after Escape, preserves bounds and selects an allowed civil date', () => {
    const trigger = open('.date-a .date-picker__trigger');
    key(trigger);
    expect(page.querySelector('.date-a .date-picker__panel')).toBeNull();
    open('.date-a .date-picker__trigger');
    const days = [...page.querySelectorAll<HTMLButtonElement>('.date-a .date-picker__day')];
    const outside = days.filter((day) => day.classList.contains('is-outside'));
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.every((day) => day.disabled)).toBe(true);
    outside[0].click();
    expect(host.date.value).toBe('2026-06-15');
    expect(host.dateOutputs).toEqual([]);
    days.find((day) => !day.classList.contains('is-outside') && day.textContent?.trim() === '16')!.click();
    fixture.detectChanges();
    expect(host.date.value).toBe('2026-06-16');
    expect(host.dateOutputs).toEqual(['2026-06-16']);
    expect(trigger.textContent).toContain('16/06/2026');
    expect(page.querySelector('.date-a .date-picker__panel')).toBeNull();
  });

  it('keeps calendar exclusivity after Escape and after destroying an open picker', () => {
    key(open('.date-a .date-picker__trigger'));
    open('.date-b .date-picker__trigger');
    expect(page.querySelector('.date-a .date-picker__panel')).toBeNull();
    expect(page.querySelector('.date-b .date-picker__panel')).not.toBeNull();
    open('.date-a .date-picker__trigger');
    expect(page.querySelector('.date-b .date-picker__panel')).toBeNull();
    fixture.destroy();

    fixture = TestBed.createComponent(PopoverHost);
    host = fixture.componentInstance;
    page = fixture.nativeElement;
    fixture.detectChanges();
    key(open('.date-a .date-picker__trigger'));
    expect(page.querySelector('.date-a .date-picker__panel')).toBeNull();
    expect(host.date.value).toBe('2026-06-15');
  });
});
