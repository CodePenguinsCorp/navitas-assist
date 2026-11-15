import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ModalFocusDirective } from '../../modal-focus/modal-focus.directive';
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

@Component({
  imports: [CustomSelectComponent, ModalFocusDirective],
  template: `
    <button type="button" class="before">Antes</button>
    <app-custom-select class="only" [options]="options" ariaLabel="Único" />
    <button type="button" class="after">Depois</button>
    @if (inModal()) {
      <section class="dialog" role="dialog" aria-modal="true" appModalFocus>
        <button type="button" class="m-before">Antes</button>
        <app-custom-select class="modal-select" [options]="options" ariaLabel="No modal" />
        <button type="button" class="m-after">Depois</button>
      </section>
    }
  `
})
class TabHost {
  readonly options = OPTIONS;
  readonly inModal = signal(false);
}

describe('CustomSelectComponent Tab from an open list', () => {
  let fixture: ComponentFixture<TabHost>;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TabHost] }).compileComponents();
    fixture = TestBed.createComponent(TabHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.nativeElement.remove());

  function openAndFocusOption(scope: string): void {
    page.querySelector<HTMLButtonElement>(`${scope} .custom-select__trigger`)!.click();
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>(`${scope} .custom-select__option`)!.focus();
  }

  function pressTab(shiftKey: boolean): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  it('closes the list and leaves the focus on the trigger for the browser to move on, without consuming the key', () => {
    openAndFocusOption('.only');
    const event = pressTab(false);
    expect(page.querySelector('.custom-select__menu')).toBeNull();
    expect(document.activeElement).toBe(page.querySelector('.only .custom-select__trigger'));
    // Not consumed: the browser's own Tab (and Shift+Tab) continues from the trigger, in one key press.
    expect(event.defaultPrevented).toBe(false);
    openAndFocusOption('.only');
    expect(pressTab(true).defaultPrevented).toBe(false);
  });

  it('moves to the next control in one Tab inside a modal, and to the previous one with Shift+Tab', () => {
    fixture.componentInstance.inModal.set(true);
    fixture.detectChanges();
    openAndFocusOption('.modal-select');
    pressTab(false);
    expect(document.activeElement).toBe(page.querySelector('.m-after'));

    openAndFocusOption('.modal-select');
    pressTab(true);
    expect(document.activeElement).toBe(page.querySelector('.m-before'));
  });
});

describe('CustomSelectComponent menu inside the viewport', () => {
  let fixture: ComponentFixture<TwoSelectsHost>;
  let page: HTMLElement;
  let trigger: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TwoSelectsHost] }).compileComponents();
    fixture = TestBed.createComponent(TwoSelectsHost);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
    trigger = page.querySelector<HTMLButtonElement>('.first .custom-select__trigger')!;
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
  });

  afterEach(() => vi.restoreAllMocks());

  function open(rect: DOMRect): HTMLElement {
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect);
    trigger.click();
    fixture.detectChanges();
    return page.querySelector<HTMLElement>('.first .custom-select__menu')!;
  }

  it('keeps a narrow trigger near the right edge inside the 8 px margin', () => {
    const menu = open(new DOMRect(220, 100, 70, 34));
    const left = Number.parseFloat(menu.style.left);
    const width = Number.parseFloat(menu.style.width);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + width).toBeLessThanOrEqual(312);
  });

  it('keeps a trigger past the left edge inside the margin', () => {
    const menu = open(new DOMRect(-30, 100, 70, 34));
    expect(Number.parseFloat(menu.style.left)).toBe(8);
  });

  it('never exceeds the viewport width minus both margins', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(130);
    const menu = open(new DOMRect(10, 100, 100, 34));
    expect(Number.parseFloat(menu.style.width)).toBeLessThanOrEqual(114);
    expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(8);
  });

  it('limits the height to the space left on the chosen side, even when it is short', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(160);
    const menu = open(new DOMRect(20, 60, 100, 34));
    // 160 - 94 - 6 - 8 = 52 below; 60 - 6 - 8 = 46 above: below wins.
    expect(Number.parseFloat(menu.style.maxHeight)).toBe(52);
  });
});
