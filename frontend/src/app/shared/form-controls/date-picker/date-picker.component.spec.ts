import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DatePickerComponent } from './date-picker.component';

@Component({
  imports: [ReactiveFormsModule, DatePickerComponent],
  template: '<app-date-picker [formControl]="control" [disabled]="blocked()" />'
})
class DateFormHost {
  readonly control = new FormControl('2026-10-15', { nonNullable: true });
  readonly blocked = signal(false);
}

describe('DatePickerComponent disabled lifecycle', () => {
  let fixture: ComponentFixture<DatePickerComponent>;
  let page: HTMLElement;
  let onChange: ReturnType<typeof vi.fn<(value: unknown) => void>>;
  let emitted: ReturnType<typeof vi.fn<(value: unknown) => void>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DatePickerComponent, DateFormHost] }).compileComponents();
    fixture = TestBed.createComponent(DatePickerComponent);
    fixture.componentInstance.writeValue('2026-10-15');
    onChange = vi.fn<(value: unknown) => void>();
    emitted = vi.fn<(value: unknown) => void>();
    fixture.componentInstance.registerOnChange(onChange);
    fixture.componentInstance.valueChange.subscribe(emitted);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.useRealTimers());

  function trigger(element = page): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('.date-picker__trigger')!;
  }

  function action(kind: 'day' | 'clear' | 'today', element = page): HTMLButtonElement {
    const selector = kind === 'day' ? '.date-picker__day' : '.date-picker__footer-action';
    const label = kind === 'day' ? '16' : kind === 'clear' ? 'Limpar' : 'Hoje';
    return [...element.querySelectorAll<HTMLButtonElement>(selector)]
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
    expect(page.querySelector('.date-picker__panel')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalled();
  });

  it('closes when disabled by input and stays closed when enabled again', () => {
    open();
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(page.querySelector('.date-picker__panel')).toBeNull();
    expect(trigger().disabled).toBe(true);
    expect(trigger().textContent).toContain('15/10/2026');
    expect(onChange).not.toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalled();
    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();
    expect(page.querySelector('.date-picker__panel')).toBeNull();
    open();
    action('day').click();
    fixture.detectChanges();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-16');
    expect(emitted).toHaveBeenCalledExactlyOnceWith('2026-10-16');
    expect(page.querySelector('.date-picker__panel')).toBeNull();
  });

  describe.each(['input', 'form'] as const)('disabled by %s', (source) => {
    it.each(['day', 'clear', 'today'] as const)('rejects %s before the DOM updates', (kind) => {
      open();
      const pendingAction = action(kind);
      if (source === 'input') fixture.componentRef.setInput('disabled', true);
      else fixture.componentInstance.setDisabledState(true);
      pendingAction.click();
      fixture.detectChanges();
      expect(onChange).not.toHaveBeenCalled();
      expect(emitted).not.toHaveBeenCalled();
      expect(trigger().textContent).toContain('15/10/2026');
      expect(page.querySelector('.date-picker__panel')).toBeNull();
    });
  });

  it('combines FormControl and input disabled states and resumes model updates', () => {
    const host = TestBed.createComponent(DateFormHost);
    host.detectChanges();
    const element: HTMLElement = host.nativeElement;
    trigger(element).click();
    host.detectChanges();
    host.componentInstance.control.disable();
    host.detectChanges();
    expect(element.querySelector('.date-picker__panel')).toBeNull();
    expect(trigger(element).disabled).toBe(true);
    expect(host.componentInstance.control.value).toBe('2026-10-15');
    host.componentInstance.blocked.set(true);
    host.detectChanges();
    host.componentInstance.control.enable();
    host.detectChanges();
    expect(trigger(element).disabled).toBe(true);
    host.componentInstance.blocked.set(false);
    host.detectChanges();
    expect(element.querySelector('.date-picker__panel')).toBeNull();
    trigger(element).click();
    host.detectChanges();
    action('day', element).click();
    host.detectChanges();
    expect(host.componentInstance.control.value).toBe('2026-10-16');
  });

  it('preserves minimum and maximum date restrictions', () => {
    fixture.componentRef.setInput('minDate', '2026-10-15');
    fixture.componentRef.setInput('maxDate', '2026-10-15');
    open();
    expect(action('day').disabled).toBe(true);
    action('day').click();
    fixture.detectChanges();
    expect(onChange).not.toHaveBeenCalled();
    expect(page.querySelector('.date-picker__panel')).not.toBeNull();
  });

  it('preserves enabled clearing', () => {
    open();
    action('clear').click();
    fixture.detectChanges();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('');
    expect(emitted).toHaveBeenCalledExactlyOnceWith('');
    expect(page.querySelector('.date-picker__panel')).toBeNull();
  });

  it('selects Today using Sao Paulo at the UTC date boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T01:30:00Z'));
    open();
    action('today').click();
    fixture.detectChanges();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-28');
    expect(emitted).toHaveBeenCalledExactlyOnceWith('2026-10-28');
    expect(page.querySelector('.date-picker__panel')).toBeNull();
  });
});
