import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BoardSentinelDirective } from './board-sentinel.directive';

@Component({ imports: [BoardSentinelDirective], template: '<div #lane><div appBoardSentinel [boardRoot]="lane" [sentinelActive]="active()" (reached)="reached()"></div></div>' })
class Host {
  active = signal(true);
  reached = vi.fn();
}

describe('Sentinela do Kanban', () => {
  it('observa a raiz da coluna com margem, pausa e desconecta ao destruir', async () => {
    let callback: IntersectionObserverCallback;
    let options: IntersectionObserverInit | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) { callback = cb; options = opts; }
      observe = observe;
      disconnect = disconnect;
    });
    try {
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(options?.root).toBe(fixture.nativeElement.firstElementChild);
      expect(options?.rootMargin).toContain('240px');
      expect(observe).toHaveBeenCalledOnce();
      callback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      expect(fixture.componentInstance.reached).toHaveBeenCalledOnce();
      fixture.componentInstance.active.set(false);
      fixture.detectChanges(); await fixture.whenStable();
      expect(disconnect).toHaveBeenCalledOnce();
      fixture.componentInstance.active.set(true);
      fixture.detectChanges(); await fixture.whenStable();
      fixture.destroy();
      expect(disconnect).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
});
