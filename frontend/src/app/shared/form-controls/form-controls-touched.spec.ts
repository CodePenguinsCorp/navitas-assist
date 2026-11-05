import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CustomSelectComponent } from './custom-select/custom-select.component';
import { DatePickerComponent } from './date-picker/date-picker.component';

@Component({
  imports: [ReactiveFormsModule, CustomSelectComponent, DatePickerComponent],
  template: `
    <app-custom-select [formControl]="select" [options]="options" (valueChange)="changes.push($event)" />
    <app-date-picker [formControl]="date" (valueChange)="changes.push($event)" />
    <button type="button" class="unrelated">Outra ação</button>
    <input class="outside" />
  `
})
class TouchHost {
  readonly select = new FormControl<string | null>(null, Validators.required);
  readonly date = new FormControl('', { nonNullable: true, validators: Validators.required });
  readonly options = [{ value: 'a', label: 'Alpha' }];
  readonly changes: unknown[] = [];
}

describe('shared form control touched state', () => {
  let fixture: ComponentFixture<TouchHost>;
  let host: TouchHost;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TouchHost] }).compileComponents();
    fixture = TestBed.createComponent(TouchHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  function control(kind: 'select' | 'date') {
    return kind === 'select' ? host.select : host.date;
  }

  function element(kind: 'select' | 'date'): HTMLElement {
    return page.querySelector<HTMLElement>(kind === 'select' ? 'app-custom-select' : 'app-date-picker')!;
  }

  function trigger(kind: 'select' | 'date'): HTMLButtonElement {
    return element(kind).querySelector<HTMLButtonElement>('button')!;
  }

  function open(kind: 'select' | 'date'): void {
    trigger(kind).click();
    fixture.detectChanges();
  }

  function choice(kind: 'select' | 'date'): HTMLButtonElement {
    return element(kind).querySelector<HTMLButtonElement>(
      kind === 'select' ? '.custom-select__option' : '.date-picker__day:not(.is-outside)'
    )!;
  }

  function expectUntouched(): void {
    expect(host.select.untouched).toBe(true);
    expect(host.date.untouched).toBe(true);
    expect(host.changes).toEqual([]);
  }

  function expectOnlyTouched(kind: 'select' | 'date'): void {
    expect(control(kind).touched).toBe(true);
    expect(control(kind === 'select' ? 'date' : 'select').untouched).toBe(true);
  }

  it('keeps idle controls untouched after a document click', () => {
    document.body.click();
    fixture.detectChanges();
    expectUntouched();
  });

  it('keeps idle controls untouched after an unrelated action', () => {
    page.querySelector<HTMLButtonElement>('.unrelated')!.click();
    fixture.detectChanges();
    expectUntouched();
  });

  it('keeps model writes separate from touch and valueChange', () => {
    host.select.setValue('a');
    host.date.setValue('2026-10-29');
    fixture.detectChanges();
    expectUntouched();
    expect(host.select.value).toBe('a');
    expect(host.date.value).toBe('2026-10-29');
  });

  describe.each(['select', 'date'] as const)('%s', (kind) => {
    it('does not mark a closed control touched when disabled and enabled programmatically', () => {
      control(kind).disable({ emitEvent: false });
      fixture.detectChanges();
      expectUntouched();
      control(kind).enable({ emitEvent: false });
      fixture.detectChanges();
      expectUntouched();
    });

    it('marks only this control touched after focus leaves without opening it', () => {
      trigger(kind).focus();
      trigger(kind).blur();
      fixture.detectChanges();
      expectOnlyTouched(kind);
      expect(host.changes).toEqual([]);
      expect(control(kind).value).toBe(kind === 'select' ? null : '');
    });

    it('does not mark internal focus movement touched until focus leaves the host', () => {
      trigger(kind).focus();
      open(kind);
      choice(kind).focus();
      fixture.detectChanges();
      expectUntouched();
      page.querySelector<HTMLInputElement>('.outside')!.focus();
      fixture.detectChanges();
      expectOnlyTouched(kind);
      expect(host.changes).toEqual([]);
    });

    it('preserves touch when the user closes an open panel with its trigger', () => {
      open(kind);
      trigger(kind).click();
      fixture.detectChanges();
      expectOnlyTouched(kind);
      expect(host.changes).toEqual([]);
    });

    it('preserves touch when an open panel closes after an outside click', () => {
      open(kind);
      document.body.click();
      fixture.detectChanges();
      expectOnlyTouched(kind);
      expect(host.changes).toEqual([]);
    });

    it('selects a valid value and touches only the control used', () => {
      open(kind);
      choice(kind).click();
      fixture.detectChanges();
      expectOnlyTouched(kind);
      expect(control(kind).valid).toBe(true);
      expect(host.changes).toEqual([control(kind).value]);
      if (kind === 'select') expect(control(kind).value).toBe('a');
      else expect(control(kind).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('ignores focusout while disabled', () => {
      control(kind).disable({ emitEvent: false });
      fixture.detectChanges();
      trigger(kind).dispatchEvent(new FocusEvent('focusout', {
        bubbles: true, relatedTarget: page.querySelector<HTMLInputElement>('.outside')
      }));
      fixture.detectChanges();
      expectUntouched();
    });
  });
});
