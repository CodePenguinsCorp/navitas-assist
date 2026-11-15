import { Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { NumberStepperDirective } from './number-stepper.directive';

@Component({
  imports: [ReactiveFormsModule, NumberStepperDirective],
  template: `
    <input id="whole" type="number" min="0.001" max="5" step="1" [formControl]="whole" />
    <input id="free" type="number" min="0.001" step="any" [formControl]="free" />
    <input id="money" type="number" min="0" step="0.01" [formControl]="money" />
    @if (show()) { <input id="gone" type="number" [formControl]="gone" /> }
  `
})
class HostComponent {
  show = signal(true);
  whole = new FormControl<number | null>(1);
  free = new FormControl<number | null>(null);
  money = new FormControl<number | null>(1.5);
  gone = new FormControl<number | null>(0);
}

describe('NumberStepperDirective', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  const root = () => fixture.nativeElement as HTMLElement;
  const press = (id: string, label: 'Aumentar' | 'Diminuir') =>
    (root().querySelector(`#${id}`)!.parentElement!.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).click();

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('wraps every number input with two labelled buttons', () => {
    const wrappers = root().querySelectorAll('.number-stepper');
    expect(wrappers).toHaveLength(4);
    expect([...wrappers[0].querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Aumentar', 'Diminuir']);
  });

  it('moves a whole-number field from 1 to 2, never to 1,001, and never below 1', () => {
    press('whole', 'Aumentar');
    expect(fixture.componentInstance.whole.value).toBe(2);
    press('whole', 'Diminuir');
    press('whole', 'Diminuir');
    expect(fixture.componentInstance.whole.value).toBe(1);
  });

  it('respects max', () => {
    fixture.componentInstance.whole.setValue(5);
    press('whole', 'Aumentar');
    expect(fixture.componentInstance.whole.value).toBe(5);
  });

  it('starts an empty field at the lowest whole value', () => {
    press('free', 'Aumentar');
    expect(fixture.componentInstance.free.value).toBe(1);
  });

  it('uses the field step without floating point noise', () => {
    press('money', 'Aumentar');
    expect(fixture.componentInstance.money.value).toBe(1.51);
    press('money', 'Diminuir');
    press('money', 'Diminuir');
    expect(fixture.componentInstance.money.value).toBe(1.49);
  });

  it('removes its wrapper when the input goes away', () => {
    fixture.componentInstance.show.set(false);
    fixture.detectChanges();
    expect(root().querySelectorAll('.number-stepper')).toHaveLength(3);
  });
});
