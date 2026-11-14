import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SuggestInputComponent } from './suggest-input.component';

@Component({
  imports: [ReactiveFormsModule, SuggestInputComponent],
  template: `
    <div class="field-group">
      <span id="cat-label">Categoria</span>
      <app-suggest-input [formControl]="control" labelledBy="cat-label" listLabel="Categorias existentes" [suggestions]="suggestions()" [maxlength]="80" [invalid]="invalid()" />
    </div>
    <button type="button" id="outside">Fora</button>
  `
})
class HostComponent {
  readonly control = new FormControl('', { nonNullable: true });
  readonly suggestions = signal<readonly string[]>(['Controle', 'Sensor', 'Fonte de alimentação', 'controle']);
  readonly invalid = signal(false);
}

describe('SuggestInputComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const host = () => fixture.componentInstance;
  const input = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const listbox = () => fixture.nativeElement.querySelector('[role="listbox"]') as HTMLElement;
  const options = () => Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('[role="option"]')).map((option) => option.textContent?.trim());
  const type = (value: string) => { input().value = value; input().dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const key = (name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    input().dispatchEvent(event); fixture.detectChanges();
    return event;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders a plain text combobox named by the visible label, with the length limit', () => {
    expect(input().type).toBe('text');
    expect(input().getAttribute('role')).toBe('combobox');
    expect(input().getAttribute('aria-labelledby')).toBe('cat-label');
    expect(input().getAttribute('maxlength')).toBe('80');
    expect(input().getAttribute('aria-controls')).toBe(listbox().id);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(listbox().hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('datalist')).toBeNull();
  });

  it('opens on focus without duplicates and filters while typing, ignoring case and accents', () => {
    input().dispatchEvent(new Event('focus')); fixture.detectChanges();
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(options()).toEqual(['Controle', 'Sensor', 'Fonte de alimentação']);
    type('ALIMENTACAO');
    expect(options()).toEqual(['Fonte de alimentação']);
    expect(host().control.value).toBe('ALIMENTACAO');
    type('Inexistente');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('navigates with the arrows, picks with Enter and keeps free text otherwise', () => {
    type('o');
    key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(fixture.nativeElement.querySelectorAll('[role="option"]')[0].id);
    key('ArrowDown'); key('ArrowUp'); key('ArrowUp');
    const active = fixture.nativeElement.querySelector('[role="option"].is-active') as HTMLElement;
    expect(active.textContent?.trim()).toBe('Fonte de alimentação');
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(key('Enter').defaultPrevented).toBe(true);
    expect(host().control.value).toBe('Fonte de alimentação');
    expect(input().value).toBe('Fonte de alimentação');
    expect(input().getAttribute('aria-expanded')).toBe('false');

    type('Nova categoria');
    expect(key('Enter').defaultPrevented).toBe(false);
    expect(host().control.value).toBe('Nova categoria');
  });

  it('closes with Escape consuming the key, so a surrounding modal stays open', () => {
    type('S');
    const event = key('Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(key('Escape').defaultPrevented).toBe(false);
  });

  it('picks with a click and closes on a click outside', () => {
    type('Sen');
    (fixture.nativeElement.querySelector('[role="option"]') as HTMLElement).click(); fixture.detectChanges();
    expect(host().control.value).toBe('Sensor');
    type('');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    document.getElementById('outside')!.dispatchEvent(new Event('pointerdown', { bubbles: true })); fixture.detectChanges();
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('follows the form value, the disabled state and the invalid flag', () => {
    host().control.setValue('Controle'); fixture.detectChanges();
    expect(input().value).toBe('Controle');
    host().invalid.set(true); fixture.detectChanges();
    expect(input().getAttribute('aria-invalid')).toBe('true');
    host().control.disable(); fixture.detectChanges();
    expect(input().disabled).toBe(true);
  });
});
