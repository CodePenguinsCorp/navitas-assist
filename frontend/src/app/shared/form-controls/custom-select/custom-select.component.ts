import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
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
}

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
  private readonly hostElement = inject(ElementRef<HTMLElement>);

  readonly options = input<readonly CustomSelectOption[]>([]);
  readonly value = input<unknown>(CUSTOM_SELECT_NO_INPUT);
  readonly placeholder = input('Selecione');
  readonly ariaLabel = input('Seleção');
  readonly disabled = input(false);

  @Output() readonly valueChange = new EventEmitter<unknown>();

  protected readonly isOpen = signal(false);

  private readonly selectedValue = signal<unknown>(null);
  private readonly disabledByForm = signal(false);

  protected readonly isDisabled = computed(() => this.disabled() || this.disabledByForm());
  protected readonly selectedOption = computed(
    () => this.options().find((option) => Object.is(option.value, this.selectedValue())) ?? null
  );

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
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

    this.isOpen.update((open) => !open);
  }

  protected selectOption(option: CustomSelectOption): void {
    this.selectedValue.set(option.value);
    this.onChange(option.value);
    this.valueChange.emit(option.value);
    this.close();
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

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.hostElement.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  private close(): void {
    if (this.isOpen()) {
      this.isOpen.set(false);
    }

    this.onTouched();
  }
}

const CUSTOM_SELECT_NO_INPUT = Symbol('custom-select-no-input');
