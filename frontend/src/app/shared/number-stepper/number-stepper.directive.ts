import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

const CHEVRON = (up: boolean) =>
  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg>`;

/**
 * Replaces the browser spinner of every `input[type=number]` with two buttons in the system style. Each press moves the value by
 * the field `step` (1 when the step is missing or `any`), stays inside `min` and `max`, and fires `input` and `change` so reactive
 * forms see it. An integer step never lands under 1 on a fractional `min` (1 up is 2, 1 down stays 1, never 0,001).
 */
@Directive({ selector: 'input[type=number]' })
export class NumberStepperDirective implements AfterViewInit, OnDestroy {
  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private wrapper: HTMLElement | null = null;

  ngAfterViewInit(): void {
    const input = this.input;
    const parent = input.parentNode;
    if (!parent) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'number-stepper';
    const buttons = document.createElement('div');
    buttons.className = 'number-stepper__buttons';
    buttons.append(this.button('Aumentar', 1), this.button('Diminuir', -1));
    parent.insertBefore(wrapper, input);
    wrapper.append(input, buttons);
    this.wrapper = wrapper;
  }

  ngOnDestroy(): void {
    this.wrapper?.remove();
    this.wrapper = null;
  }

  private button(label: string, direction: 1 | -1): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.className = 'number-stepper__button';
    button.setAttribute('aria-label', label);
    button.innerHTML = CHEVRON(direction === 1);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => this.stepBy(direction));
    return button;
  }

  private stepBy(direction: 1 | -1): void {
    const input = this.input;
    if (input.disabled || input.readOnly) return;
    const rawStep = Number(input.step);
    const step = input.step && input.step !== 'any' && rawStep > 0 ? rawStep : 1;
    const current = Number.parseFloat(input.value.replace(',', '.'));
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    // A whole-number step must not drop to a tiny fractional minimum (0,001): the lowest whole value is 1.
    const lowest = step >= 1 && min > 0 && min < 1 ? 1 : min;
    const base = Number.isFinite(current) ? current : (direction === 1 ? lowest - step : lowest);
    const next = Number((base + direction * step).toFixed(6));
    const bounded = Math.min(max, Math.max(lowest === -Infinity ? next : lowest, next));
    if (Number.isFinite(current) && bounded === current) return;
    input.value = String(bounded);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
