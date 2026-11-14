import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CollapsibleSectionComponent } from './collapsible-section.component';

@Component({
  imports: [CollapsibleSectionComponent],
  template: `
    <app-collapsible-section title="Histórico" [count]="count()" icon="history" [open]="open()" [storageKey]="key()">
      <button sectionActions type="button" class="act" (click)="acted = true">Registrar</button>
      <p class="content"><input class="field" /></p>
    </app-collapsible-section>
  `
})
class HostComponent {
  acted = false;
  readonly count = signal<number | null>(3);
  readonly open = signal(true);
  readonly key = signal<string | null>(null);
}

describe('CollapsibleSectionComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let el: HTMLElement;

  const toggle = () => el.querySelector<HTMLButtonElement>('.collapsible__toggle')!;
  const body = () => el.querySelector<HTMLElement>('.collapsible__body')!;

  function create(setup: (host: HostComponent) => void = () => undefined) {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    setup(host);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('starts open, shows title and count chip and links button and region', () => {
    create();
    expect(toggle().textContent).toContain('Histórico');
    expect(el.querySelector('.collapsible__count')?.textContent?.trim()).toBe('3');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-controls')).toBe(body().id);
    expect(body().getAttribute('aria-labelledby')).toBe(toggle().id);
    expect(body().hidden).toBe(false);
  });

  it('omits the chip without a count and accepts zero', () => {
    create();
    host.count.set(null);
    fixture.detectChanges();
    expect(el.querySelector('.collapsible__count')).toBeNull();
    host.count.set(0);
    fixture.detectChanges();
    expect(el.querySelector('.collapsible__count')?.textContent?.trim()).toBe('0');
  });

  it('folds and unfolds by click, native button (Enter/Space) and chevron, keeping the content alive', () => {
    create();
    const field = el.querySelector('.field');
    expect(toggle().tagName).toBe('BUTTON');
    expect(toggle().type).toBe('button');
    toggle().click();
    fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(body().hidden).toBe(true);
    expect(el.querySelector('.field')).toBe(field);
    toggle().click();
    fixture.detectChanges();
    expect(body().hidden).toBe(false);
    el.querySelector<HTMLElement>('.collapsible__chevron')!.click();
    fixture.detectChanges();
    expect(body().hidden).toBe(true);
  });

  it('starts folded when open is false', () => {
    create((h) => h.open.set(false));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(body().hidden).toBe(true);
  });

  it('keeps header actions out of the fold', () => {
    create();
    el.querySelector<HTMLButtonElement>('.act')!.click();
    fixture.detectChanges();
    expect(host.acted).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('remembers the choice under navitas.section.<key> and restores it', () => {
    create((h) => h.key.set('rma.history'));
    toggle().click();
    fixture.detectChanges();
    expect(localStorage.getItem('navitas.section.rma.history')).toBe('0');
    fixture.destroy();

    create((h) => h.key.set('rma.history'));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('does not break when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    create((h) => h.key.set('rma.history'));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    toggle().click();
    fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('exposes isOpen and setOpen for hosts that fold several sections', () => {
    create();
    const section = fixture.debugElement.children[0].componentInstance as CollapsibleSectionComponent;
    section.setOpen(false);
    fixture.detectChanges();
    expect(section.isOpen()).toBe(false);
    expect(body().hidden).toBe(true);
  });
});
