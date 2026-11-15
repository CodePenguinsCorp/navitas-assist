import { Directive, ElementRef, afterRenderEffect, inject, input, output } from '@angular/core';

@Directive({ selector: '[appBoardSentinel]' })
export class BoardSentinelDirective {
  readonly boardRoot = input.required<HTMLElement>();
  readonly sentinelActive = input(false);
  readonly reached = output<void>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect((cleanup) => {
      if (!this.sentinelActive() || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(entries => {
        if (this.sentinelActive() && entries.some(entry => entry.isIntersecting)) this.reached.emit();
      }, { root: this.boardRoot(), rootMargin: '0px 0px 240px 0px' });
      observer.observe(this.element.nativeElement);
      cleanup(() => observer.disconnect());
    });
  }
}
