import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  computed,
  forwardRef,
  inject,
  input,
  signal
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

interface CalendarDay {
  iso: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

@Component({
  selector: 'app-date-picker',
  templateUrl: './date-picker.component.html',
  styleUrl: './date-picker.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePickerComponent),
      multi: true
    }
  ]
})
export class DatePickerComponent implements ControlValueAccessor {
  private readonly hostElement = inject(ElementRef<HTMLElement>);

  readonly placeholder = input('Selecione uma data');
  readonly ariaLabel = input('Selecionar data');
  readonly disabled = input(false);
  readonly allowClear = input(true);

  @Output() readonly valueChange = new EventEmitter<string>();

  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly isOpen = signal(false);

  private readonly selectedValue = signal('');
  private readonly disabledByForm = signal(false);
  private readonly viewMonth = signal(startOfMonth(new Date()));

  protected readonly isDisabled = computed(() => this.disabled() || this.disabledByForm());
  protected readonly displayValue = computed(() => formatDisplayDate(this.selectedValue(), this.placeholder()));
  protected readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(this.viewMonth())
  );
  protected readonly calendarDays = computed(() => buildCalendarDays(this.viewMonth(), this.selectedValue()));

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  protected toggle(): void {
    if (this.isDisabled()) {
      return;
    }

    if (!this.isOpen()) {
      this.focusCurrentMonth();
    }

    this.isOpen.update((open) => !open);
  }

  protected previousMonth(): void {
    this.viewMonth.set(shiftMonth(this.viewMonth(), -1));
  }

  protected nextMonth(): void {
    this.viewMonth.set(shiftMonth(this.viewMonth(), 1));
  }

  protected selectDay(day: CalendarDay): void {
    this.applyValue(day.iso);
    this.close();
  }

  protected clear(): void {
    this.applyValue('');
    this.close();
  }

  protected selectToday(): void {
    this.applyValue(toIsoDate(new Date()));
    this.close();
  }

  writeValue(value: string | null): void {
    const normalized = value ?? '';
    this.selectedValue.set(normalized);

    const parsed = parseIsoDate(normalized);
    if (parsed) {
      this.viewMonth.set(startOfMonth(parsed));
    }
  }

  registerOnChange(fn: (value: string) => void): void {
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

  private applyValue(value: string): void {
    this.selectedValue.set(value);
    this.onChange(value);
    this.valueChange.emit(value);
    this.focusCurrentMonth();
  }

  private focusCurrentMonth(): void {
    const parsed = parseIsoDate(this.selectedValue());
    this.viewMonth.set(startOfMonth(parsed ?? new Date()));
  }

  private close(): void {
    if (this.isOpen()) {
      this.isOpen.set(false);
    }

    this.onTouched();
  }
}

function buildCalendarDays(viewMonth: Date, selectedValue: string): CalendarDay[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const startDate = new Date(year, month, 1 - startOffset);
  const todayIso = toIsoDate(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
    const iso = toIsoDate(date);

    return {
      iso,
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
      isToday: iso === todayIso,
      isSelected: iso === selectedValue
    };
  });
}

function formatDisplayDate(value: string, placeholder: string): string {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return placeholder;
  }

  return new Intl.DateTimeFormat('pt-BR').format(parsed);
}

function parseIsoDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
