import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  Injector,
  Output,
  afterNextRender,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface CustomSelectOption<T = unknown> {
  value: T;
  label: string;
  /** Listed but not choosable; `hint` should say why. */
  disabled?: boolean;
  /** Secondary line under the label (a username, a reason). */
  hint?: string;
  /** RMA status key: the option and the trigger take that status hue. */
  status?: string;
  /** Person initials; '' draws the empty avatar. */
  avatar?: string;
}

let nextMenuId = 0;

@Component({
  selector: 'app-custom-select',
  templateUrl: './custom-select.component.html',
  styleUrl: './custom-select.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomSelectComponent),
      multi: true
    }
  ]
})
export class CustomSelectComponent implements ControlValueAccessor {
  private readonly hostElement: ElementRef<HTMLElement> = inject(ElementRef);

  readonly options = input<readonly CustomSelectOption[]>([]);
  readonly value = input<unknown>(CUSTOM_SELECT_NO_INPUT);
  readonly placeholder = input('Selecione');
  readonly ariaLabel = input('Seleção');
  /** Id(s) of the message that describes the trigger, such as a field error. */
  readonly ariaDescribedBy = input<string | null>(null);
  /** Reflects the invalid state of the bound field on the trigger. */
  readonly ariaInvalid = input(false);
  readonly disabled = input(false);
  /** 'compact' fits toolbars and table rows (34px, content width). */
  readonly size = input<'default' | 'compact'>('default');
  /**
   * Acts as an action menu: emits the choice without changing what the trigger shows
   * (the placeholder, or the option matching `value` until the parent updates it).
   */
  readonly actionMenu = input(false);
  /** 'status' draws the trigger as a status pill; 'person' as avatar + name. */
  readonly appearance = input<'field' | 'status' | 'person'>('field');

  @Output() readonly valueChange = new EventEmitter<unknown>();

  protected readonly menuId = `custom-select-menu-${nextMenuId++}`;
  protected readonly isOpen = signal(false);
  private readonly injector = inject(Injector);
  private typeahead = '';
  private typeaheadTimer: ReturnType<typeof setTimeout> | undefined;
  /** Menu is fixed to the viewport so it never stretches a scrolling modal or table. */
  protected readonly menuPosition = signal<{ top: number; left: number; width: number; maxHeight: number; above: boolean } | null>(null);

  private readonly selectedValue = signal<unknown>(null);
  private readonly disabledByForm = signal(false);

  protected readonly isDisabled = computed(() => this.disabled() || this.disabledByForm());
  protected readonly selectedOption = computed(
    () => this.options().find((option) => Object.is(option.value, this.selectedValue())) ?? null
  );

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    const onAnyScroll = (event: Event) => this.handleScroll(event);
    document.addEventListener('scroll', onAnyScroll, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', onAnyScroll, true));

    effect(() => {
      if (this.isDisabled() && this.isOpen()) this.close();
    });

    effect(() => {
      const incomingValue = this.value();
      if (incomingValue !== CUSTOM_SELECT_NO_INPUT) {
        this.selectedValue.set(incomingValue);
      }
    });
  }

  protected toggle(): void {
    if (this.isDisabled()) {
      return;
    }

    if (this.isOpen()) this.close();
    else this.open();
  }

  private open(): void {
    this.placeMenu();
    this.isOpen.set(true);
  }

  /** A pointer open leaves focus on the trigger; arrow keys open the list and move into it. */
  protected handleTriggerKeydown(event: KeyboardEvent): void {
    if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || this.isDisabled()) return;
    event.preventDefault();
    if (!this.isOpen()) this.open();
    afterNextRender(() => {
      const items = this.enabledOptions();
      (items.find((item) => item.classList.contains('is-selected')) ?? items[0])?.focus();
    }, { injector: this.injector });
  }

  /** Listbox keys: arrows, Home/End, typeahead; Tab closes back to the trigger. */
  protected handleMenuKeydown(event: KeyboardEvent): void {
    const items = this.enabledOptions();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let target: HTMLElement | undefined;
    if (event.key === 'ArrowDown') target = items[(index + 1) % items.length];
    else if (event.key === 'ArrowUp') target = items[(index - 1 + items.length) % items.length];
    else if (event.key === 'Home') target = items[0];
    else if (event.key === 'End') target = items[items.length - 1];
    else if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      this.focusTrigger();
      return;
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      target = this.matchTypeahead(event.key, items, index);
    }
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  private matchTypeahead(key: string, items: HTMLElement[], index: number): HTMLElement | undefined {
    clearTimeout(this.typeaheadTimer);
    this.typeahead += key.toLocaleLowerCase();
    this.typeaheadTimer = setTimeout(() => (this.typeahead = ''), 500);
    // A growing prefix keeps the current match; a new first letter cycles from the next one.
    const start = this.typeahead.length > 1 ? Math.max(index, 0) : index + 1;
    const ordered = [...items.slice(start), ...items.slice(0, start)];
    const label = (item: HTMLElement) => item.querySelector('.custom-select__name')?.textContent?.trim().toLocaleLowerCase() ?? '';
    return ordered.find((item) => label(item).startsWith(this.typeahead));
  }

  private optionElements(): HTMLElement[] {
    return [...this.hostElement.nativeElement.querySelectorAll<HTMLElement>('.custom-select__option')];
  }

  private enabledOptions(): HTMLElement[] {
    return this.optionElements().filter((item) => item.getAttribute('aria-disabled') !== 'true');
  }

  private focusTrigger(): void {
    this.hostElement.nativeElement.querySelector<HTMLButtonElement>('.custom-select__trigger')?.focus();
  }

  private placeMenu(): void {
    const trigger = this.hostElement.nativeElement.querySelector<HTMLElement>('.custom-select__trigger');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const below = window.innerHeight - rect.bottom - gap - 8;
    const above = rect.top - gap - 8;
    const openAbove = below < 200 && above > below;
    const maxHeight = Math.max(120, Math.min(280, openAbove ? above : below));
    this.menuPosition.set({
      top: openAbove ? rect.top - gap : rect.bottom + gap,
      left: rect.left,
      width: Math.max(rect.width, 140),
      maxHeight,
      above: openAbove
    });
  }

  @HostListener('window:resize')
  protected handleViewportChange(): void {
    this.close();
  }

  protected handleScroll(event: Event): void {
    const menu = this.hostElement.nativeElement.querySelector('.custom-select__menu');
    if (menu && event.target instanceof Node && menu.contains(event.target)) return;
    this.close();
  }

  protected selectOption(option: CustomSelectOption): void {
    if (this.isDisabled() || option.disabled) return;
    if (!this.actionMenu()) this.selectedValue.set(option.value);
    this.onChange(option.value);
    this.close();
    this.focusTrigger();
    this.valueChange.emit(option.value);
  }

  protected isSelected(option: CustomSelectOption): boolean {
    return Object.is(option.value, this.selectedValue());
  }

  writeValue(value: unknown): void {
    this.selectedValue.set(value);
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled);
    if (isDisabled) {
      this.close();
    }
  }

  @HostListener('keydown.escape', ['$event'])
  protected handleEscape(event: Event): void {
    if (!this.isOpen() || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
    this.focusTrigger();
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.hostElement.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('focusout', ['$event'])
  protected handleFocusOut(event: FocusEvent): void {
    if (!this.isDisabled() && !this.hostElement.nativeElement.contains(event.relatedTarget as Node | null)) {
      this.onTouched();
    }
  }

  private close(): void {
    if (this.isOpen()) {
      this.isOpen.set(false);
      this.onTouched();
    }
  }
}

const CUSTOM_SELECT_NO_INPUT = Symbol('custom-select-no-input');
