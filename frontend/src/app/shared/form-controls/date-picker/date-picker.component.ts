import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  Output,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { todayInputValue } from '../../../core/utils/date';

interface CalendarDay {
  iso: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Seven 40 px columns, 8 px padding on each side and the 1 px border. */
const CALENDAR_WIDTH = 298;
/** Height of a full month (header, weekdays, six weeks and footer), used to choose a side. */
const CALENDAR_HEIGHT = 384;
const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 6;

interface CalendarPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  above: boolean;
}

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
export class DatePickerComponent implements ControlValueAccessor, OnDestroy {
  private static openPicker: DatePickerComponent | null = null;
  private readonly hostElement: ElementRef<HTMLElement> = inject(ElementRef);

  readonly placeholder = input('Selecione uma data');
  readonly ariaLabel = input('Selecionar data');
  /** Id(s) of the message that describes the trigger, such as a field error. */
  readonly ariaDescribedBy = input<string | null>(null);
  /** Reflects the invalid state of the bound field on the trigger. */
  readonly ariaInvalid = input(false);
  readonly disabled = input(false);
  readonly allowClear = input(true);
  readonly minDate = input('');
  readonly maxDate = input('');

  @Output() readonly valueChange = new EventEmitter<string>();

  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly isOpen = signal(false);
  /** Panel is fixed to the viewport, inside the margins, without leaving the host's DOM. */
  protected readonly calendarPosition = signal<CalendarPosition | null>(null);

  private readonly selectedValue = signal('');
  private readonly disabledByForm = signal(false);
  private readonly viewMonth = signal(startOfMonth(parseIsoDate(todayInputValue())!));

  protected readonly isDisabled = computed(() => this.disabled() || this.disabledByForm());
  protected readonly displayValue = computed(() => formatDisplayDate(this.selectedValue(), this.placeholder()));
  protected readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(this.viewMonth())
  );
  protected readonly calendarDays = computed(() => buildCalendarDays(this.viewMonth(), this.selectedValue()));
  protected readonly todayDisabled = computed(() => this.isDateDisabled(todayInputValue()));

  protected isDateDisabled(iso: string): boolean {
    return (!!this.minDate() && iso < this.minDate()) || (!!this.maxDate() && iso > this.maxDate());
  }

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // Capture: scroll does not bubble, and any scrolling ancestor moves the field away from the panel.
    const onAnyScroll = (event: Event) => this.handleScroll(event);
    document.addEventListener('scroll', onAnyScroll, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', onAnyScroll, true));

    effect(() => {
      if (this.isDisabled() && this.isOpen()) this.close();
    });
  }

  protected toggle(): void {
    if (this.isDisabled()) {
      return;
    }

    if (!this.isOpen()) {
      DatePickerComponent.openPicker?.close();
      this.focusCurrentMonth();
      this.placeCalendar();
      this.isOpen.set(true);
      DatePickerComponent.openPicker = this;
    } else {
      this.close();
    }
  }

  protected previousMonth(): void {
    this.viewMonth.set(shiftMonth(this.viewMonth(), -1));
  }

  protected nextMonth(): void {
    this.viewMonth.set(shiftMonth(this.viewMonth(), 1));
  }

  protected selectDay(day: CalendarDay): void {
    if (this.isDateDisabled(day.iso)) return;
    this.applyValue(day.iso);
    this.close();
  }

  protected clear(): void {
    this.applyValue('');
    this.close();
  }

  protected selectToday(): void {
    if (this.todayDisabled()) return;
    this.applyValue(todayInputValue());
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

  ngOnDestroy(): void {
    if (DatePickerComponent.openPicker === this) {
      DatePickerComponent.openPicker = null;
    }
  }

  @HostListener('keydown.escape', ['$event'])
  protected handleEscape(event: Event): void {
    if (!this.isOpen() || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
    this.hostElement.nativeElement.querySelector<HTMLButtonElement>('.date-picker__trigger')?.focus();
  }

  @HostListener('window:resize')
  protected handleViewportChange(): void {
    this.close();
  }

  protected handleScroll(event: Event): void {
    const panel = this.hostElement.nativeElement.querySelector('.date-picker__panel');
    if (panel && event.target instanceof Node && panel.contains(event.target)) return;
    this.close();
  }

  /**
   * Below the field when a full month fits, otherwise on the roomier side; the panel never
   * crosses the 8 px viewport margins and scrolls internally when its side is too short.
   */
  private placeCalendar(): void {
    const trigger = this.hostElement.nativeElement.querySelector<HTMLElement>('.date-picker__trigger');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(CALENDAR_WIDTH, window.innerWidth - 2 * VIEWPORT_MARGIN);
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - VIEWPORT_MARGIN - width));
    const below = window.innerHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_MARGIN;
    const above = rect.top - TRIGGER_GAP - VIEWPORT_MARGIN;
    const openAbove = below < CALENDAR_HEIGHT && above > below;
    this.calendarPosition.set({
      top: openAbove ? rect.top - TRIGGER_GAP : rect.bottom + TRIGGER_GAP,
      left,
      width,
      maxHeight: Math.max(0, openAbove ? above : below),
      above: openAbove
    });
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.hostElement.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  private applyValue(value: string): void {
    if (this.isDisabled()) return;
    this.selectedValue.set(value);
    this.onChange(value);
    this.valueChange.emit(value);
    this.focusCurrentMonth();
  }

  private focusCurrentMonth(): void {
    const parsed = parseIsoDate(this.selectedValue());
    this.viewMonth.set(startOfMonth(parsed ?? parseIsoDate(todayInputValue())!));
  }

  @HostListener('focusout', ['$event'])
  protected handleFocusOut(event: FocusEvent): void {
    if (!this.isDisabled() && !this.hostElement.nativeElement.contains(event.relatedTarget as Node | null)) {
      this.onTouched();
    }
  }

  private close(): void {
    if (DatePickerComponent.openPicker === this) {
      DatePickerComponent.openPicker = null;
    }
    if (this.isOpen()) {
      this.isOpen.set(false);
      this.onTouched();
    }
  }
}

function buildCalendarDays(viewMonth: Date, selectedValue: string): CalendarDay[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const startDate = new Date(year, month, 1 - startOffset);
  const todayIso = todayInputValue();

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
