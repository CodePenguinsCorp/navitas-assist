import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TipDirective } from './tip.directive';

@Component({ imports: [TipDirective], template: '<p appTip="Nome completo da empresa">Nome completo da empresa</p><span appTip="Maria Silva">MS</span>' })
class TextHostComponent {}

@Component({ imports: [TipDirective], template: '<button appTip="Texto completo" [tipPosition]="position()" aria-label="Abrir">Abrir</button>' })
class HostComponent { readonly position = signal<'right' | 'top' | 'bottom'>('top'); }

describe('TipDirective', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  it('mostra no hover e foco e remove ao sair, clicar e pressionar Esc', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    for (const [open, close] of [['mouseenter', 'mouseleave'], ['focus', 'blur'], ['focus', 'click'], ['focus', 'keydown']]) {
      button.dispatchEvent(new Event(open));
      expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Texto completo');
      button.dispatchEvent(close === 'keydown' ? new KeyboardEvent(close, { key: 'Escape' }) : new Event(close));
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
    }
    expect(button.getAttribute('aria-label')).toBe('Abrir');
  });
  it('so mostra a dica que repete o texto quando ele esta cortado, e sempre a que acrescenta informacao', () => {
    const fixture = TestBed.createComponent(TextHostComponent);
    fixture.detectChanges();
    const [text, initials] = [fixture.nativeElement.querySelector('p') as HTMLElement, fixture.nativeElement.querySelector('span') as HTMLElement];
    text.dispatchEvent(new Event('mouseenter'));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    Object.defineProperty(text, 'scrollWidth', { configurable: true, value: 300 });
    Object.defineProperty(text, 'clientWidth', { configurable: true, value: 120 });
    text.dispatchEvent(new Event('mouseenter'));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Nome completo da empresa');
    text.dispatchEvent(new Event('mouseleave'));
    initials.dispatchEvent(new Event('mouseenter'));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Maria Silva');
    initials.dispatchEvent(new Event('mouseleave'));
  });
  it('nunca mostra barra de rolagem dentro da dica', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.dispatchEvent(new Event('mouseenter'));
    const tip = document.querySelector('[role="tooltip"]') as HTMLElement;
    expect(tip.style.overflow).toBe('hidden');
    button.dispatchEvent(new Event('mouseleave'));
  });
  it('preserva a descricao atual do campo ao fechar a dica', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.dispatchEvent(new Event('focus'));
    button.setAttribute('aria-describedby', 'erro-atual');
    button.dispatchEvent(new Event('blur'));
    expect(button.getAttribute('aria-describedby')).toBe('erro-atual');
    button.dispatchEvent(new Event('focus'));
    expect(button.getAttribute('aria-describedby')).toContain('erro-atual');
    button.dispatchEvent(new Event('blur'));
    expect(button.getAttribute('aria-describedby')).toBe('erro-atual');
  });
  it.each(['right', 'top', 'bottom'] as const)('posiciona %s sem ultrapassar a viewport', (position) => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.position.set(position);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: innerWidth - 30, right: innerWidth, top: innerHeight - 20, bottom: innerHeight, width: 30, height: 20 } as DOMRect);
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
      return this.getAttribute('role') === 'tooltip' ? { width: 180, height: 60 } as DOMRect : original.call(this);
    });
    button.dispatchEvent(new Event('mouseenter'));
    const tip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(parseFloat(tip.style.left)).toBeGreaterThanOrEqual(8);
    expect(parseFloat(tip.style.left) + 180).toBeLessThanOrEqual(innerWidth - 8);
    expect(parseFloat(tip.style.top)).toBeGreaterThanOrEqual(8);
    expect(parseFloat(tip.style.top) + 60).toBeLessThanOrEqual(innerHeight - 8);
  });
  it('mantem a dica dentro da viewport e a remove ao destruir', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: innerWidth - 20, right: innerWidth, top: innerHeight - 20, bottom: innerHeight, width: 20, height: 20 } as DOMRect);
    button.dispatchEvent(new Event('mouseenter'));
    const tip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(parseFloat(tip.style.left)).toBeLessThan(innerWidth);
    expect(parseFloat(tip.style.top)).toBeLessThan(innerHeight);
    expect(tip.style.transform).toBe('');
    fixture.destroy();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
