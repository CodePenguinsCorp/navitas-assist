import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RowActionComponent } from './row-action.component';

@Component({
  imports: [RowActionComponent],
  template: `
    <div class="row-actions">
      <button appRowAction icon="pencil" label="Editar" target="Alfa" [disabled]="disabled()" (click)="clicked = true"></button>
      <button appRowAction icon="trash" label="Excluir" target="Alfa" tone="danger" [blockedReason]="reason()"></button>
    </div>
  `
})
class HostComponent {
  clicked = false;
  readonly disabled = signal(false);
  readonly reason = signal<string | null>(null);
}

describe('RowActionComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let element: HTMLElement;
  let originalInnerWidth: number;
  let originalInnerHeight: number;

  beforeEach(async () => {
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: originalInnerHeight });
    vi.restoreAllMocks();
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from(element.querySelectorAll<HTMLButtonElement>('.row-actions button'));
  }

  function tip(button: HTMLButtonElement): HTMLElement {
    return button.querySelector<HTMLElement>('[role="tooltip"]')!;
  }

  it('names the button with label and target', () => {
    const [edit, remove] = buttons();
    expect(edit.getAttribute('aria-label')).toBe('Editar Alfa');
    expect(remove.getAttribute('aria-label')).toBe('Excluir Alfa');
    expect(edit.type).toBe('button');
    expect(edit.classList).toContain('icon-button');
    expect(edit.querySelector('app-icon')).not.toBeNull();
  });

  it('renders the tooltip text and no title attribute', () => {
    const [edit, remove] = buttons();
    expect(tip(edit).textContent?.trim()).toBe('Editar');
    expect(tip(remove).textContent?.trim()).toBe('Excluir');
    expect(edit.hasAttribute('title')).toBe(false);
    expect(remove.hasAttribute('title')).toBe(false);
  });

  it('applies the danger class for tone danger', () => {
    const [edit, remove] = buttons();
    expect(edit.classList).not.toContain('icon-button--danger');
    expect(remove.classList).toContain('icon-button--danger');
  });

  it('marks aria-disabled and describes the reason when blockedReason is set', () => {
    const remove = buttons()[1];
    expect(remove.hasAttribute('aria-disabled')).toBe(false);
    expect(remove.hasAttribute('aria-describedby')).toBe(false);

    host.reason.set('Você não pode excluir a própria conta.');
    fixture.detectChanges();

    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(tip(remove).textContent?.trim()).toBe('Você não pode excluir a própria conta.');
    expect(remove.getAttribute('aria-describedby')).toBe(tip(remove).id);
    expect(remove.disabled).toBe(false);
    expect(remove.tabIndex).toBe(0);
  });

  it('keeps the consumer click handler and disabled binding', () => {
    const edit = buttons()[0];
    edit.click();
    expect(host.clicked).toBe(true);

    host.disabled.set(true);
    fixture.detectChanges();
    expect(edit.disabled).toBe(true);
  });

  it('generates distinct tooltip ids for two instances', () => {
    const [edit, remove] = buttons();
    expect(tip(edit).id).toBeTruthy();
    expect(tip(edit).id).not.toBe(tip(remove).id);
  });

  function placeButton(button: HTMLButtonElement, top: number, left = 100): void {
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(
      { top, bottom: top + 34, left, right: left + 34, width: 34, height: 34, x: left, y: top, toJSON: () => ({}) } as DOMRect
    );
  }

  /** jsdom has no layout: give the tooltip the box a real browser would measure. */
  function sizeTip(button: HTMLButtonElement, width: number, height: number): void {
    vi.spyOn(tip(button), 'getBoundingClientRect').mockReturnValue(
      { top: 0, bottom: height, left: 0, right: width, width, height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    );
  }

  function setViewportHeight(value: number): void {
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value });
  }

  const isOpen = (button: HTMLButtonElement) => {
    fixture.detectChanges();
    return tip(button).classList.contains('is-open');
  };

  it('opens on focus above the button using the measured height, inside the viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 320 });
    setViewportHeight(800);
    const edit = buttons()[0];
    placeButton(edit, 200, 270);
    sizeTip(edit, 400, 30);

    edit.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    const tooltip = tip(edit);
    const left = parseFloat(tooltip.style.left);
    const maxWidth = parseFloat(tooltip.style.maxWidth);
    expect(tooltip.classList).toContain('is-open');
    expect(tooltip.classList).not.toContain('row-action__tip--below');
    expect(parseFloat(tooltip.style.top)).toBe(164);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + maxWidth).toBeLessThanOrEqual(312);
  });

  it('opens below the button when the measured tooltip does not fit above', () => {
    setViewportHeight(800);
    const edit = buttons()[0];
    placeButton(edit, 48);
    sizeTip(edit, 200, 46);

    edit.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(tip(edit).classList).toContain('is-open');
    expect(tip(edit).classList).toContain('row-action__tip--below');
    expect(parseFloat(tip(edit).style.top)).toBe(88);
  });

  it('stays above a button near the top when the tooltip is short enough to fit', () => {
    setViewportHeight(800);
    const edit = buttons()[0];
    placeButton(edit, 40);
    sizeTip(edit, 60, 20);

    edit.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(tip(edit).classList).not.toContain('row-action__tip--below');
    expect(parseFloat(tip(edit).style.top)).toBe(14);
  });

  it('keeps the tooltip inside the viewport vertically when neither side has room', () => {
    setViewportHeight(120);
    const edit = buttons()[0];
    placeButton(edit, 40);
    sizeTip(edit, 200, 100);

    edit.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const top = parseFloat(tip(edit).style.top);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + 100).toBeLessThanOrEqual(112);
  });

  it('dismisses a hover-opened tooltip with Escape while focus is on another control', () => {
    const search = document.createElement('input');
    document.body.appendChild(search);
    try {
      search.focus();
      const edit = buttons()[0];
      edit.dispatchEvent(new MouseEvent('mouseenter'));
      expect(isOpen(edit)).toBe(true);

      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(isOpen(edit)).toBe(false);
      expect(document.activeElement).toBe(search);
    } finally {
      search.remove();
    }
  });

  it('dismisses a focus-opened tooltip with Escape and keeps the focus', () => {
    const edit = buttons()[0];
    edit.focus();
    expect(isOpen(edit)).toBe(true);

    edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isOpen(edit)).toBe(false);
    expect(document.activeElement).toBe(edit);
  });

  it('stops listening for Escape on the document once closed', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const edit = buttons()[0];
    edit.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    edit.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('stays open while the button keeps focus even if the pointer leaves', () => {
    const edit = buttons()[0];
    edit.dispatchEvent(new FocusEvent('focus'));
    edit.dispatchEvent(new MouseEvent('mouseenter'));
    edit.dispatchEvent(new MouseEvent('mouseleave'));
    expect(isOpen(edit)).toBe(true);

    edit.dispatchEvent(new FocusEvent('blur'));
    expect(isOpen(edit)).toBe(false);
  });

  it('stays open after blur while the pointer is still over the button', () => {
    const edit = buttons()[0];
    edit.dispatchEvent(new MouseEvent('mouseenter'));
    edit.dispatchEvent(new FocusEvent('focus'));
    edit.dispatchEvent(new FocusEvent('blur'));
    expect(isOpen(edit)).toBe(true);

    edit.dispatchEvent(new MouseEvent('mouseleave'));
    expect(isOpen(edit)).toBe(false);
  });

  it('stays open when the pointer moves from the button onto the tooltip', () => {
    const edit = buttons()[0];
    edit.dispatchEvent(new MouseEvent('mouseenter'));
    edit.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: tip(edit) }));
    expect(isOpen(edit)).toBe(true);

    edit.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: document.body }));
    expect(isOpen(edit)).toBe(false);
  });

  it('does not trigger the action when the tooltip text itself is clicked', () => {
    const edit = buttons()[0];
    edit.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    tip(edit).click();
    expect(host.clicked).toBe(false);
  });

  it('closes on mouseleave and blur when neither hover nor focus remains, and on scroll and resize', () => {
    const edit = buttons()[0];

    edit.dispatchEvent(new MouseEvent('mouseenter'));
    edit.dispatchEvent(new MouseEvent('mouseleave'));
    expect(isOpen(edit)).toBe(false);

    edit.dispatchEvent(new FocusEvent('focus'));
    edit.dispatchEvent(new FocusEvent('blur'));
    expect(isOpen(edit)).toBe(false);

    edit.dispatchEvent(new FocusEvent('focus'));
    expect(isOpen(edit)).toBe(true);
    document.body.dispatchEvent(new Event('scroll'));
    expect(isOpen(edit)).toBe(false);

    edit.dispatchEvent(new FocusEvent('blur'));
    edit.dispatchEvent(new FocusEvent('focus'));
    expect(isOpen(edit)).toBe(true);
    window.dispatchEvent(new Event('resize'));
    expect(isOpen(edit)).toBe(false);
  });
});
