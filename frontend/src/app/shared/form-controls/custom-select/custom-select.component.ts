import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  Injector,
  Output,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { normalizeSearchText } from '../../../core/utils/suggestions';
import { popupDismiss } from '../../popup-dismiss/popup-dismiss';

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
  /** RMA priority key: the option draws the priority bars and the trigger takes that priority colour. */
  priority?: string;
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
  readonly searchable = input(false, { transform: booleanAttribute });
  /** 'compact' fits toolbars and table rows (34px, content width). */
  readonly size = input<'default' | 'compact'>('default');
  /**
   * Acts as an action menu: emits the choice without changing what the trigger shows
   * (the placeholder, or the option matching `value` until the parent updates it).
   */
  readonly actionMenu = input(false);
  /** 'status' draws the trigger as a status pill; 'person' as avatar + name; 'priority' as bars + level. */
  readonly appearance = input<'field' | 'status' | 'person' | 'priority'>('field');

  @Output() readonly valueChange = new EventEmitter<unknown>();

  protected readonly menuId = `custom-select-menu-${nextMenuId++}`;
  protected readonly isOpen = signal(false);
  protected readonly search = signal('');
  private readonly activeOption = signal<CustomSelectOption | undefined>(undefined);
  protected readonly visibleOptions = computed(() => {
    const query = normalizeSearchText(this.search());
    return this.searchable() && query
      ? this.options().filter((option) => normalizeSearchText(option.label).includes(query)
        || normalizeSearchText(option.hint ?? '').includes(query))
      : this.options();
  });
  protected readonly activeIndex = computed(() => {
    const options = this.visibleOptions();
    const current = this.activeOption();
    const active = current ? options.indexOf(current) : -1;
    return active >= 0 && !options[active].disabled ? active : options.findIndex((option) => !option.disabled);
  });
  private readonly injector = inject(Injector);
  /** Press or focus outside closes the menu; opening it closes any other popup. */
  private readonly dismiss = popupDismiss(() => this.close());
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

  private open(query = ''): void {
    this.search.set(query);
    this.activeOption.set(query ? undefined : this.selectedOption() ?? undefined);
    this.placeMenu();
    this.isOpen.set(true);
    this.dismiss.opened();
    if (this.searchable()) {
      afterNextRender(() => {
        const search = this.hostElement.nativeElement.querySelector<HTMLInputElement>('input[role="combobox"]');
        search?.focus({ preventScroll: true });
        search?.setSelectionRange(query.length, query.length);
        this.scrollActiveOption();
      }, { injector: this.injector });
    }
  }

  protected updateSearch(query: string): void {
    this.search.set(query);
    this.activeOption.set(undefined);
    const list = this.hostElement.nativeElement.querySelector<HTMLElement>('.custom-select__list');
    if (list) list.scrollTop = 0;
  }

  protected handleSearchKeydown(event: KeyboardEvent): void {
    if (event.isComposing || this.isDisabled()) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = this.visibleOptions()[this.activeIndex()];
      if (option) this.selectOption(option);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const options = this.visibleOptions();
      const enabled = options.filter((option) => !option.disabled);
      if (!enabled.length) return;
      const index = enabled.indexOf(options[this.activeIndex()]);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.activeOption.set(enabled[(index + step + enabled.length) % enabled.length]);
      this.scrollActiveOption();
    }
  }

  private scrollActiveOption(): void {
    const option = this.optionElements()[this.activeIndex()];
    const list = option?.parentElement;
    if (!list) return;
    const bounds = list.getBoundingClientRect();
    const row = option.getBoundingClientRect();
    if (row.top < bounds.top) list.scrollTop += row.top - bounds.top;
    else if (row.bottom > bounds.bottom) list.scrollTop += row.bottom - bounds.bottom;
  }

  /** A pointer open leaves focus on the trigger; arrow keys open the list and move into it. */
  protected handleTriggerKeydown(event: KeyboardEvent): void {
    if (this.isDisabled() || event.isComposing) return;
    if (this.searchable() && !this.isOpen() && event.key !== ' ' && Array.from(event.key).length === 1
      && (event.getModifierState('AltGraph') || (!event.ctrlKey && !event.metaKey && !event.altKey))) {
      event.preventDefault();
      this.open(event.key);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!this.isOpen()) this.open();
    if (this.searchable()) {
      this.hostElement.nativeElement.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus({ preventScroll: true });
      return;
    }
    afterNextRender(() => {
      const items = this.enabledOptions();
      (items.find((item) => item.classList.contains('is-selected')) ?? items[0])?.focus();
    }, { injector: this.injector });
  }

  /** Listbox keys: arrows, Home/End, typeahead; Tab closes back to the trigger. */
  protected handleMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      // Continue from the trigger in the browser's normal Tab order or the modal's focus cycle.
      this.close();
      this.focusTrigger();
      return;
    }
    if (this.searchable()) return;

    const items = this.enabledOptions();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let target: HTMLElement | undefined;
    if (event.key === 'ArrowDown') target = items[(index + 1) % items.length];
    else if (event.key === 'ArrowUp') target = items[(index - 1 + items.length) % items.length];
    else if (event.key === 'Home') target = items[0];
    else if (event.key === 'End') target = items[items.length - 1];
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
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
    const margin = 8;
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const openAbove = below < 200 && above > below;
    // Inside the viewport margins on every side; the list scrolls internally when its side is short.
    const maxHeight = Math.max(0, Math.min(280, openAbove ? above : below));
    const width = Math.min(Math.max(rect.width, 140), window.innerWidth - 2 * margin);
    this.menuPosition.set({
      top: openAbove ? rect.top - gap : rect.bottom + gap,
      left: Math.max(margin, Math.min(rect.left, window.innerWidth - margin - width)),
      width,
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
    if (!this.isOpen() || event.defaultPrevented || (event instanceof KeyboardEvent && event.isComposing)) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
    this.focusTrigger();
  }

  @HostListener('focusout', ['$event'])
  protected handleFocusOut(event: FocusEvent): void {
    if (!this.isDisabled() && !this.hostElement.nativeElement.contains(event.relatedTarget as Node | null)) {
      this.onTouched();
    }
  }

  private close(): void {
    this.dismiss.closed();
    if (this.isOpen()) {
      this.isOpen.set(false);
      this.onTouched();
    }
  }
}

const CUSTOM_SELECT_NO_INPUT = Symbol('custom-select-no-input');
