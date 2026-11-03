import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CustomSelectComponent } from './custom-select.component';

const OPTIONS = [
  { value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' },
  { value: null, label: 'Nenhum' }, { value: 0, label: 'Zero' }
];

@Component({
  imports: [ReactiveFormsModule, CustomSelectComponent],
  template: '<app-custom-select [formControl]="control" [options]="options" [disabled]="blocked()" />'
})
class SelectFormHost {
  readonly control = new FormControl<string | number | null>('a');
  readonly options = OPTIONS;
  readonly blocked = signal(false);
}

describe('CustomSelectComponent disabled lifecycle', () => {
  let fixture: ComponentFixture<CustomSelectComponent>;
  let page: HTMLElement;
  let onChange: ReturnType<typeof vi.fn<(value: unknown) => void>>;
  let emitted: ReturnType<typeof vi.fn<(value: unknown) => void>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CustomSelectComponent, SelectFormHost] }).compileComponents();
    fixture = TestBed.createComponent(CustomSelectComponent);
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentInstance.writeValue('a');
    onChange = vi.fn<(value: unknown) => void>();
    emitted = vi.fn<(value: unknown) => void>();
    fixture.componentInstance.registerOnChange(onChange);
    fixture.componentInstance.valueChange.subscribe(emitted);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  function trigger(element = page): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('.custom-select__trigger')!;
  }

  function option(label: string, element = page): HTMLButtonElement {
    return [...element.querySelectorAll<HTMLButtonElement>('.custom-select__option')]
      .find((button) => button.textContent?.trim() === label)!;
  }

  function open(): void {
    trigger().click();
    fixture.detectChanges();
  }

  it('does not open or emit when initially disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    expect(trigger().disabled).toBe(true);
    expect(page.querySelector('.custom-select__menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalled();
  });

  it('closes when disabled by input and stays closed when enabled again', () => {
    open();
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(page.querySelector('.custom-select__menu')).toBeNull();
    expect(trigger().disabled).toBe(true);
    expect(trigger().textContent).toContain('Alpha');
    expect(onChange).not.toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalled();
    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();
    expect(page.querySelector('.custom-select__menu')).toBeNull();
    open();
    option('Beta').click();
    fixture.detectChanges();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('b');
    expect(emitted).toHaveBeenCalledExactlyOnceWith('b');
    expect(page.querySelector('.custom-select__menu')).toBeNull();
  });

  it.each(['input', 'form'] as const)('rejects an option before the DOM updates after disabling by %s', (source) => {
    open();
    const pendingOption = option('Beta');
    if (source === 'input') fixture.componentRef.setInput('disabled', true);
    else fixture.componentInstance.setDisabledState(true);
    pendingOption.click();
    fixture.detectChanges();
    expect(onChange).not.toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalled();
    expect(trigger().textContent).toContain('Alpha');
    expect(page.querySelector('.custom-select__menu')).toBeNull();
  });

  it('combines FormControl and input disabled states and resumes model updates', () => {
    const host = TestBed.createComponent(SelectFormHost);
    host.detectChanges();
    const element: HTMLElement = host.nativeElement;
    trigger(element).click();
    host.detectChanges();
    host.componentInstance.control.disable();
    host.detectChanges();
    expect(element.querySelector('.custom-select__menu')).toBeNull();
    expect(trigger(element).disabled).toBe(true);
    expect(host.componentInstance.control.value).toBe('a');
    host.componentInstance.blocked.set(true);
    host.detectChanges();
    host.componentInstance.control.enable();
    host.detectChanges();
    expect(trigger(element).disabled).toBe(true);
    host.componentInstance.blocked.set(false);
    host.detectChanges();
    expect(element.querySelector('.custom-select__menu')).toBeNull();
    trigger(element).click();
    host.detectChanges();
    option('Beta', element).click();
    host.detectChanges();
    expect(host.componentInstance.control.value).toBe('b');
  });

  it.each([
    { value: null, label: 'Nenhum' }, { value: 0, label: 'Zero' }, { value: 'b', label: 'Beta' }
  ])('preserves the selected value type for $label', ({ value, label }) => {
    open();
    option(label).click();
    fixture.detectChanges();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(value);
    expect(emitted).toHaveBeenCalledExactlyOnceWith(value);
    expect(trigger().textContent).toContain(label);
    expect(page.querySelector('.custom-select__menu')).toBeNull();
  });

  it('preserves outside-click closure while enabled', () => {
    open();
    document.body.click();
    fixture.detectChanges();
    expect(page.querySelector('.custom-select__menu')).toBeNull();
  });
});
