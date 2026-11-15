import { TestBed } from '@angular/core/testing';
import { ToastService } from '../core/services/toast.service';

/** Mensagens dos avisos flutuantes atualmente abertos, na ordem de exibição. */
export function toastMessages(): string[] {
  return TestBed.inject(ToastService).toasts().map(toast => toast.message);
}

/** Tons dos avisos abertos, para provar que sucesso não vira erro. */
export function toastTones(): string[] {
  return TestBed.inject(ToastService).toasts().map(toast => toast.tone);
}
