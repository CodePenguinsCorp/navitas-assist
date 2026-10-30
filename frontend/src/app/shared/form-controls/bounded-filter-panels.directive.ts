import { afterEveryRender, Directive, ElementRef, HostListener, inject } from '@angular/core';

/** Keeps Kanban filter overlays inside the page without changing its layout. */
@Directive({ selector: '[appBoundedFilterPanels]' })
export class BoundedFilterPanelsDirective {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  constructor() {
    afterEveryRender(() => this.positionPanels());
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected positionPanels(): void {
    const host = this.host.nativeElement;
    const viewport = host.ownerDocument.defaultView;
    if (!viewport) return;

    const page = host.closest('.shell')?.getBoundingClientRect();
    const top = Math.max(0, page?.top ?? 0) + 8;
    const bottom = Math.min(viewport.innerHeight, page?.bottom ?? viewport.innerHeight) - 8;

    for (const panel of host.querySelectorAll<HTMLElement>('.custom-select__menu, .date-picker__panel')) {
      const anchor = panel.offsetParent as HTMLElement | null;
      if (!anchor) continue;

      // Measure the original overlay before applying any available-space limit.
      panel.style.top = '';
      panel.style.bottom = '';
      panel.style.maxHeight = '';
      panel.style.overflowY = '';
      const anchorBounds = anchor.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      const gap = Math.max(0, panelBounds.top - anchorBounds.bottom);
      const below = Math.max(0, bottom - anchorBounds.bottom - gap);
      const above = Math.max(0, anchorBounds.top - top - gap);

      if (panelBounds.height <= below) continue;

      const openAbove = above > below;
      const available = openAbove ? above : below;
      if (openAbove) {
        panel.style.top = 'auto';
        panel.style.bottom = `calc(100% + ${gap}px)`;
      }
      panel.style.maxHeight = `${Math.min(panelBounds.height, available)}px`;
      panel.style.overflowY = 'auto';
    }
  }
}
