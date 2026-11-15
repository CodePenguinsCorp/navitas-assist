import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ErrorDialogComponent } from './error-dialog.component';

describe('ErrorDialogComponent', () => {
  let fixture: ComponentFixture<ErrorDialogComponent>;
  const root = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(ErrorDialogComponent);
    fixture.componentRef.setInput('message', 'Sem conexão com o servidor.');
    fixture.detectChanges();
  });

  it('presents a titled alert dialog with the message and two actions', () => {
    const dialog = root().querySelector('[role="alertdialog"]')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h3')!.id);
    expect(dialog.querySelector('h3')!.textContent).toBe('Não foi possível carregar');
    expect(dialog.querySelector('.error-dialog__message')!.textContent).toBe('Sem conexão com o servidor.');
    expect([...dialog.querySelectorAll('.form-actions button')].map(b => b.textContent!.trim())).toEqual(['Fechar', 'Tentar novamente']);
  });

  it('emits retry and closed from its actions', () => {
    const retry = vi.fn(); const closed = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    fixture.componentInstance.closed.subscribe(closed);
    (root().querySelector('.button-primary') as HTMLElement).click();
    (root().querySelector('.form-actions .button-secondary') as HTMLElement).click();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
