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

describe('DatePickerComponent preservation: disabled lifecycle and civil dates', () => {
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

describe('DatePickerComponent new: viewport placement and dismissal', () => {
  let fixture: ComponentFixture<DatePickerComponent>;
  let page: HTMLElement;
  let trigger: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DatePickerComponent] }).compileComponents();
    fixture = TestBed.createComponent(DatePickerComponent);
    fixture.detectChanges();
    page = fixture.nativeElement;
    trigger = page.querySelector('.date-picker__trigger')!;
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(700);
  });

  afterEach(() => vi.restoreAllMocks());

  function open(top = 100): HTMLElement {
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(270, top, 40, 40));
    trigger.click();
    fixture.detectChanges();
    return page.querySelector('.date-picker__panel')!;
  }

  it('fits a full calendar inside 8px margins beside a narrow right-edge field', () => {
    const panel = open();
    expect(panel.style.width).toBe('298px');
    expect(panel.style.left).toBe('14px');
    expect(panel.style.top).toBe('146px');
    expect(Number.parseFloat(panel.style.maxHeight)).toBeLessThanOrEqual(546);
    expect(page.contains(panel)).toBe(true);
  });

  it('opens above when the viewport has insufficient room below', () => {
    const panel = open(620);
    expect(panel.classList.contains('is-above')).toBe(true);
    expect(panel.style.top).toBe('614px');
    expect(Number.parseFloat(panel.style.maxHeight)).toBeLessThanOrEqual(606);
    expect(Number.parseFloat(panel.style.maxHeight)).toBeGreaterThan(0);
  });

  it('clamps the left edge and height when neither side fits the full calendar', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(320);
    const rect = vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(-5, 100, 40, 40));
    trigger.click();
    fixture.detectChanges();
    const panel = page.querySelector<HTMLElement>('.date-picker__panel')!;
    expect(rect).toHaveBeenCalled();
    expect(panel.style.left).toBe('8px');
    expect(panel.style.top).toBe('146px');
    expect(panel.style.maxHeight).toBe('166px');
  });

  it('closes on an external non-bubbling scroll but preserves internal panel scrolling', () => {
    const panel = open();
    panel.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(page.querySelector('.date-picker__panel')).toBe(panel);
    page.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(page.querySelector('.date-picker__panel')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on resize', () => {
    open();
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();
    expect(page.querySelector('.date-picker__panel')).toBeNull();
  });

  it('measures the field again on each opening', () => {
    open(620);
    trigger.click();
    fixture.detectChanges();
    const panel = open(100);
    expect(panel.classList.contains('is-above')).toBe(false);
    expect(panel.style.top).toBe('146px');
  });

  it('limits the width to the viewport minus both margins on very narrow screens', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(280);
    const panel = open();
    expect(panel.style.width).toBe('264px');
    expect(panel.style.left).toBe('8px');
  });
});
