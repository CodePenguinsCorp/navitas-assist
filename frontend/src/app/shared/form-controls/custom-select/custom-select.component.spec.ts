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
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(page.querySelector('.custom-select__menu')).toBeNull();
  });
});

@Component({
  imports: [CustomSelectComponent],
  template: `
    <section class="panel" (click)="$event.stopPropagation()" (pointerdown)="$event.stopPropagation()">
      <p class="outside">Fora</p>
      <app-custom-select class="first" [options]="options" ariaLabel="Primeiro" />
      <app-custom-select class="second" [options]="options" ariaLabel="Segundo" />
    </section>
  `
})
class TwoSelectsHost {
  readonly options = OPTIONS;
}

describe('CustomSelectComponent dismissal', () => {
  let fixture: ComponentFixture<TwoSelectsHost>;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TwoSelectsHost] }).compileComponents();
    fixture = TestBed.createComponent(TwoSelectsHost);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  const trigger = (which: string) => page.querySelector<HTMLButtonElement>(`.${which} .custom-select__trigger`)!;
  const menu = (which: string) => page.querySelector(`.${which} .custom-select__menu`);
  const press = (target: Element) => { target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); fixture.detectChanges(); };
  const open = (which: string) => { trigger(which).click(); fixture.detectChanges(); };

  it('closes on a press outside even inside a panel that stops propagation (modal detail)', () => {
    open('first');
    expect(menu('first')).not.toBeNull();
    press(page.querySelector('.outside')!);
    expect(menu('first')).toBeNull();
  });

  it('stays open on a press inside the menu', () => {
    open('first');
    press(page.querySelector('.first .custom-select__option')!);
    expect(menu('first')).not.toBeNull();
  });

  it('closes on Escape and returns focus to its trigger', () => {
    open('first');
    page.querySelector<HTMLButtonElement>('.first .custom-select__option')!.focus();
    page.querySelector('.first .custom-select__menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(menu('first')).toBeNull();
    expect(document.activeElement).toBe(trigger('first'));
  });

  it('closes when focus moves outside (Tab away)', () => {
    open('first');
    trigger('second').focus();
    fixture.detectChanges();
    expect(menu('first')).toBeNull();
  });

  it('keeps only one menu open at a time', () => {
    open('first');
    open('second');
    expect(menu('first')).toBeNull();
    expect(menu('second')).not.toBeNull();
  });
});
