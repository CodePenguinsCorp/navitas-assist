import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('Avisos temporários', () => {
  let service: ToastService;
  beforeEach(() => { vi.useFakeTimers(); service = TestBed.inject(ToastService); });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });
  it('mantém os três mais recentes em ordem e não duplica mensagens', () => {
    const first = service.show({ message: 'Um', tone: 'success' });
    const run = vi.fn();
    const replacement = service.show({ message: 'Um', tone: 'info', actions: [{ label: 'Desfazer', run }] });
    expect(replacement).not.toBe(first);
    expect(service.toasts()).toHaveLength(1);
    service.dismiss(first);
    service.toasts()[0].actions![0].run();
    expect(run).toHaveBeenCalledOnce();
    for (const message of ['Dois', 'Três', 'Quatro']) service.show({ message, tone: 'info' });
    expect(service.toasts().map(item => item.message)).toEqual(['Dois', 'Três', 'Quatro']);
  });
  it('fecha em cinco segundos sem ações e oito com ações; erros persistem', () => {
    service.show({ message: 'Salvo', tone: 'success' });
    service.show({ message: 'Movido', tone: 'info', actions: [{ label: 'Desfazer', run: () => {} }] });
    service.show({ message: 'Erro', tone: 'error', durationMs: 10 });
    vi.advanceTimersByTime(5000);
    expect(service.toasts().map(item => item.message)).toEqual(['Movido', 'Erro']);
    vi.advanceTimersByTime(3000);
    expect(service.toasts().map(item => item.message)).toEqual(['Erro']);
  });
  it('pausa por mouse e foco independentemente e retoma o tempo restante', () => {
    const id = service.show({ message: 'Salvo', tone: 'success', durationMs: 1000 });
    vi.advanceTimersByTime(400);
    service.pause(id, 'pointer'); service.pause(id, 'focus');
    vi.advanceTimersByTime(3000); service.resume(id, 'pointer');
    vi.advanceTimersByTime(3000); expect(service.toasts()).toHaveLength(1);
    service.resume(id, 'focus'); vi.advanceTimersByTime(599);
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(service.toasts()).toHaveLength(0);
  });
  it('descarta temporizadores ao fechar e destruir', () => {
    const id = service.show({ message: 'Salvo', tone: 'info' });
    service.dismiss(id); expect(service.toasts()).toHaveLength(0);
    service.show({ message: 'Outro', tone: 'info' });
    TestBed.resetTestingModule(); expect(vi.getTimerCount()).toBe(0);
  });
});
