import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CustomSelectComponent } from './custom-select/custom-select.component';
import { DatePickerComponent } from './date-picker/date-picker.component';

/* The global stylesheet is not loaded in unit tests; these mirror the :root tokens it defines. */
const TOKENS: Record<string, string> = {
  '--control-height': '40px',
  '--control-height-sm': '34px',
  '--control-padding-x': '16px',
  '--disabled-opacity': '0.65',
  '--line': 'rgb(217, 227, 238)',
  '--danger-text': 'rgb(151, 65, 80)'
};

@Component({
  imports: [ReactiveFormsModule, CustomSelectComponent, DatePickerComponent],
  template: `
    <app-custom-select class="select" [formControl]="select" [options]="options" />
    <app-custom-select class="compact" size="compact" [options]="options" [value]="'a'" />
    <app-date-picker class="date" [formControl]="date" />
  `
})
class StatesHost {
  readonly select = new FormControl<string | null>(null, Validators.required);
  readonly date = new FormControl('', { nonNullable: true, validators: Validators.required });
  readonly options = [{ value: 'a', label: 'Alpha' }];
}

describe('shared form control states', () => {
  let fixture: ComponentFixture<StatesHost>;
  let host: StatesHost;
  let page: HTMLElement;

  beforeEach(async () => {
    for (const [name, value] of Object.entries(TOKENS)) document.documentElement.style.setProperty(name, value);
    await TestBed.configureTestingModule({ imports: [StatesHost] }).compileComponents();
    fixture = TestBed.createComponent(StatesHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    for (const name of Object.keys(TOKENS)) document.documentElement.style.removeProperty(name);
  });

  function trigger(selector: string): HTMLButtonElement {
    return page.querySelector<HTMLButtonElement>(`${selector} button`)!;
  }

  function control(kind: 'select' | 'date') {
    return kind === 'select' ? host.select : host.date;
  }

  function borderColor(kind: 'select' | 'date'): string {
    return getComputedStyle(trigger(`.${kind}`)).borderTopColor;
  }

  it('gives select and date triggers the shared control height', () => {
    expect(getComputedStyle(trigger('.select')).minHeight).toBe('40px');
    expect(getComputedStyle(trigger('.date')).minHeight).toBe('40px');
    expect(getComputedStyle(trigger('.compact')).minHeight).toBe('34px');
  });

  describe.each(['select', 'date'] as const)('%s', (kind) => {
    it('keeps the neutral border while invalid but untouched', () => {
      expect(control(kind).invalid).toBe(true);
      expect(borderColor(kind)).toBe(TOKENS['--line']);
    });

    it('shows the error border once an invalid value is touched', () => {
      control(kind).markAsTouched();
      fixture.detectChanges();
      expect(borderColor(kind)).toBe(TOKENS['--danger-text']);
    });

    it('shows the error border once an invalid value is edited', () => {
      control(kind).markAsDirty();
      fixture.detectChanges();
      expect(borderColor(kind)).toBe(TOKENS['--danger-text']);
    });

    it('drops the error border when the value becomes valid', () => {
      control(kind).markAsTouched();
      control(kind).setValue(kind === 'select' ? 'a' : '2026-06-15');
      fixture.detectChanges();
      expect(borderColor(kind)).toBe(TOKENS['--line']);
    });

    it('dims the trigger with the shared disabled opacity', () => {
      control(kind).disable();
      fixture.detectChanges();
      expect(trigger(`.${kind}`).disabled).toBe(true);
      expect(getComputedStyle(trigger(`.${kind}`)).opacity).toBe('0.65');
    });
  });
});
