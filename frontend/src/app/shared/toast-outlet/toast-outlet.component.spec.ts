import { simulateNativeModality } from '../../testing/native-dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastService } from '../../core/services/toast.service';
import { ToastOutletComponent } from './toast-outlet.component';

describe('Exibição dos avisos', () => {
  let fixture: ComponentFixture<ToastOutletComponent>;
  let service: ToastService;
  const host = () => fixture.nativeElement as HTMLElement;
  const render = () => { fixture.detectChanges(); TestBed.tick(); };
  beforeEach(() => {
    service = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(ToastOutletComponent);
  });
  it('mantém o popover sem rolagem com no máximo três avisos', () => {
    for (const message of ['Primeiro', 'Segundo', 'Terceiro', 'Quarto']) {
      service.show({ message, tone: 'info' });
    }
    render();
    expect(host().getAttribute('popover')).toBe('manual');
    expect(getComputedStyle(host()).overflow).toBe('visible');
    expect(host().querySelectorAll('section')).toHaveLength(3);
    expect(host().textContent).not.toContain('Primeiro');
  });
  it('fecha pelo X com nome acessível e não rouba o foco', () => {
    const previous = document.activeElement;
    service.show({ message: 'Salvo', tone: 'success' }); render();
    expect(document.activeElement).toBe(previous);
    host().querySelector<HTMLButtonElement>('[aria-label="Fechar aviso"]')!.click(); render();
    expect(host().querySelector('section')).toBeNull();
  });
  it('executa a ação e fecha o aviso antes de publicar a mesma mensagem', () => {
    const run = vi.fn(() => service.show({ message: 'Salvo', tone: 'success' }));
    service.show({ message: 'Salvo', tone: 'success', actions: [{ label: 'Desfazer', run }] }); render();
    host().querySelector<HTMLButtonElement>('.link-button')!.click(); render();
    expect(run).toHaveBeenCalledOnce();
    expect(service.toasts()).toHaveLength(1);
    expect(host().querySelector('.link-button')).toBeNull();
  });
  it('anuncia sucesso e informação com status e erro com alert', () => {
    for (const tone of ['success', 'info', 'error'] as const) service.show({ message: tone, tone });
    render();
    expect(host().querySelectorAll('[role="status"][aria-live="polite"]')).toHaveLength(2);
    expect(host().querySelector('[role="alert"][aria-live="assertive"]')?.textContent).toContain('error');
  });
  it('fecha com Escape no aviso focado e não propaga para o modal', () => {
    service.show({ message: 'Salvo', tone: 'info' }); render();
    const close = host().querySelector<HTMLButtonElement>('button')!; close.focus();
    expect(document.activeElement).toBe(close);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    close.dispatchEvent(event); render();
    expect(event.defaultPrevented).toBe(true);
    expect(service.toasts()).toHaveLength(0);
  });
  it('pausa o tempo durante hover e foco e mantém pausa ao mudar entre botões', () => {
    vi.useFakeTimers();
    try {
      service.show({ message: 'Salvo', tone: 'info', durationMs: 1000, actions: [{ label: 'Ver', run: () => {} }] }); render();
      const card = host().querySelector('section')!;
      card.dispatchEvent(new MouseEvent('mouseenter'));
      const buttons = host().querySelectorAll<HTMLButtonElement>('button');
      buttons[0].focus(); buttons[1].focus();
      card.dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(2000); expect(service.toasts()).toHaveLength(1);
      buttons[1].blur(); vi.advanceTimersByTime(1000); render();
      expect(service.toasts()).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });
  it('mantém o aviso operável quando um diálogo nativo abre e retorna ao fechar', async () => {
    const restore = simulateNativeModality();
    const dialog = document.createElement('dialog'); document.body.append(dialog);
    const second = document.createElement('dialog'); dialog.before(second);
    try {
      service.show({ message: 'Salvo', tone: 'success' }); render();
      const parent = host().parentElement;
      dialog.showModal();
      await new Promise<void>(resolve => queueMicrotask(resolve));
      expect(dialog.contains(host())).toBe(true);
      const close = host().querySelector<HTMLButtonElement>('button')!;
      close.focus(); expect(document.activeElement).toBe(close);
      second.showModal();
      await new Promise<void>(resolve => queueMicrotask(resolve));
      expect(second.contains(host())).toBe(true);
      second.close();
      await new Promise<void>(resolve => queueMicrotask(resolve));
      expect(dialog.contains(host())).toBe(true);
      dialog.close();
      await new Promise<void>(resolve => queueMicrotask(resolve));
      expect(host().parentElement).toBe(parent);
      close.click(); render(); expect(service.toasts()).toHaveLength(0);
    } finally { second.close(); second.remove(); dialog.close(); dialog.remove(); restore(); }
  });

});
