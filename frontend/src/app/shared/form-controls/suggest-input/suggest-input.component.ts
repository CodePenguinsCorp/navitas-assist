import { Component, ElementRef, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextSuggestId = 0;

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();

/**
 * Campo de texto livre com sugestões (combobox ARIA 1.2 com lista). Substitui o `<datalist>` nativo:
 * filtra enquanto digita, navega com as setas, escolhe com Enter e fecha com Esc ou clique fora.
 * O valor continua sendo o texto digitado; as sugestões só ajudam a reaproveitar o que já existe.
 */
@Component({
  selector: 'app-suggest-input',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SuggestInputComponent), multi: true }],
  host: {
    class: 'suggest-input',
    '(document:pointerdown)': 'onDocumentPointerDown($event)'
  },
  template: `
    <input
      type="text"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      [attr.aria-labelledby]="labelledBy() || null"
      [attr.aria-activedescendant]="activeIndex() >= 0 ? optionId(activeIndex()) : null"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      [attr.maxlength]="maxlength()"
      [attr.placeholder]="placeholder() || null"
      [value]="value()"
      [disabled]="disabled()"
      (input)="onInput($any($event.target).value)"
      (focus)="onFocus()"
      (blur)="onTouched()"
      (keydown)="onKeydown($event)"
    />
    <ul class="suggest-input__menu" role="listbox" [id]="listId" [attr.aria-label]="listLabel()" [hidden]="!open()">
      @for (option of filtered(); track option; let index = $index) {
        <li
          role="option"
          class="suggest-input__option"
          [id]="optionId(index)"
          [class.is-active]="index === activeIndex()"
          [attr.aria-selected]="index === activeIndex()"
          (pointerdown)="$event.preventDefault()"
          (click)="choose(option)"
        >{{ option }}</li>
      }
    </ul>
  `
})
export class SuggestInputComponent implements ControlValueAccessor {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly suggestions = input<readonly string[]>([]);
  readonly maxlength = input<number | null>(null);
  readonly placeholder = input('');
  readonly invalid = input(false);
  /** Id do rótulo visível. Use com um contêiner que não seja `<label>`, para o nome não incluir as sugestões. */
  readonly labelledBy = input('');
  /** Nome acessível da lista de sugestões. */
  readonly listLabel = input('Sugestões');

  protected readonly listId = `suggest-input-${++nextSuggestId}`;
  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly expanded = signal(false);
  protected readonly activeIndex = signal(-1);
  /** Texto usado no filtro: só o que foi digitado agora. Ao focar, todas as sugestões aparecem. */
  private readonly term = signal('');

  /** Sugestões sem repetição que contêm o texto digitado (sem acento nem caixa). */
  protected readonly filtered = computed(() => {
    const term = normalize(this.term());
    const seen = new Set<string>();
    const matches = this.suggestions().filter((option) => {
      const key = normalize(option);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return key.includes(term);
    });
    // Nada a sugerir quando o texto digitado já é exatamente a única opção.
    return term && matches.length === 1 && normalize(matches[0]) === term ? [] : matches;
  });
  protected readonly open = computed(() => this.expanded() && !this.disabled() && this.filtered().length > 0);

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
    if (disabled) this.close();
  }

  protected optionId(index: number): string {
    return `${this.listId}-option-${index}`;
  }

  protected onInput(value: string): void {
    this.value.set(value);
    this.term.set(value);
    this.onChange(value);
    this.expanded.set(true);
    this.activeIndex.set(-1);
  }

  protected onFocus(): void {
    this.term.set('');
    this.expanded.set(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.filtered().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!count) return;
        event.preventDefault();
        if (!this.open()) {
          this.expanded.set(true);
          this.activeIndex.set(event.key === 'ArrowDown' ? 0 : count - 1);
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const current = this.activeIndex();
        this.activeIndex.set(current < 0 ? (step > 0 ? 0 : count - 1) : (current + step + count) % count);
        this.scrollActiveIntoView();
        return;
      }
      case 'Enter': {
        const option = this.open() ? this.filtered()[this.activeIndex()] : undefined;
        if (option === undefined) return;
        event.preventDefault();
        this.choose(option);
        return;
      }
      case 'Escape':
        if (!this.open()) return;
        // Fecha só a lista: o modal em volta não deve fechar junto.
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      case 'Tab':
        this.close();
        return;
    }
  }

  protected choose(option: string): void {
    this.value.set(option);
    this.onChange(option);
    this.close();
  }

  protected onDocumentPointerDown(event: Event): void {
    if (this.expanded() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  private close(): void {
    this.term.set('');
    this.expanded.set(false);
    this.activeIndex.set(-1);
  }

  private scrollActiveIntoView(): void {
    const id = this.optionId(this.activeIndex());
    queueMicrotask(() => this.host.nativeElement.querySelector(`#${id}`)?.scrollIntoView?.({ block: 'nearest' }));
  }
}
