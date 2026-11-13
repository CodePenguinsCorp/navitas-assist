import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { RmaResponse, RmaStatusUpdateRequest } from '../../core/models';
import { RmaService } from '../../core/services/rma.service';
import { providePermissions } from '../../testing/permission-fixtures';
import { buildRma } from '../../testing/rma-fixtures';
import { RmaStatusFieldComponent } from './rma-status-field.component';

describe('Status inline do RMA', () => {
  let fixture: ComponentFixture<RmaStatusFieldComponent>;
  let request: ReturnType<RmaService['updateStatus']>;
  let calls: RmaStatusUpdateRequest[];
  let notes: Array<{ id: number; eventId: number; note: string }> ;
  const original = buildRma();
  const moved = buildRma({ status: 'TRIAGE', statusHistory: [{ id: 7, status: 'TRIAGE', changedBy: 'tester', changedAt: '2026-11-13T10:00:00Z', note: null }] });
  const host = () => fixture.nativeElement as HTMLElement;
  const render = () => { fixture.detectChanges(); TestBed.tick(); };
  const button = (label: string) => [...host().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)!;
  const pick = () => { fixture.componentInstance.move('TRIAGE'); render(); };

  beforeEach(async () => {
    calls = []; notes = [];
    request = of(moved);
    await TestBed.configureTestingModule({
      imports: [RmaStatusFieldComponent],
      providers: [providePermissions(['rma.status']), { provide: RmaService, useValue: {
        updateStatusNote: (id: number, eventId: number, note: string) => { notes.push({ id, eventId, note }); return of(moved); },
        updateStatus: (_id: number, payload: RmaStatusUpdateRequest) => { calls.push(payload); return request; }
      } }]
    }).compileComponents();
    fixture = TestBed.createComponent(RmaStatusFieldComponent);
    fixture.componentRef.setInput('rma', original);
    fixture.componentInstance.saved.subscribe(rma => fixture.componentRef.setInput('rma', rma));
    render();
  });

  it('aplica imediatamente, sem diálogo, e desfaz pela mesma API', () => {
    pick();
    expect(calls).toEqual([{ status: 'TRIAGE', note: '' }]);
    expect(host().querySelector('[role="dialog"]')).toBeNull();
    expect(host().textContent).toContain('Movido para Triagem');
    request = of(original);
    button('Desfazer').click(); render();
    expect(calls[1]).toEqual({ status: 'RECEIVED', note: '' });
    expect(host().textContent).toContain('Alteração desfeita');
    expect(button('Desfazer')).toBeUndefined();
  });

  it('mantém o status anterior e mostra a recusa inline', () => {
    request = throwError(() => ({ error: { message: 'Protocolo obrigatório pendente.' } }));
    pick();
    expect(host().querySelector('[role="alert"]')?.textContent).toContain('Protocolo obrigatório pendente.');
    expect(fixture.componentInstance.rma()?.status).toBe('RECEIVED');
  });

  it('preserva a recusa do primeiro drop quando o quadro vincula o RMA no mesmo ciclo', () => {
    fixture.componentRef.setInput('rma', null); render();
    request = throwError(() => ({ error: { message: 'Protocolo obrigatório pendente.' } }));
    fixture.componentRef.setInput('rma', original);
    fixture.componentInstance.move('TRIAGE', original); render();
    expect(host().querySelector('[role="alert"]')?.textContent).toContain('Protocolo obrigatório pendente.');
  });

  it('mantém o movimento e o desfazer disponível se a reversão for recusada', () => {
    pick();
    request = throwError(() => ({ error: { message: 'Transição bloqueada.' } }));
    button('Desfazer').click(); render();
    expect(fixture.componentInstance.rma()?.status).toBe('TRIAGE');
    expect(host().textContent).toContain('Transição bloqueada.');
    expect(button('Desfazer')).toBeDefined();
  });

  it('salva a observação no evento recém-criado sem reservar para outra mudança', () => {
    pick(); button('Adicionar observação').click(); render();
    const textarea = host().querySelector('textarea')!;
    textarea.value = ' Aguardando avaliação '; textarea.dispatchEvent(new Event('input'));
    button('Salvar').click(); render();
    expect(notes).toEqual([{ id: 1, eventId: 7, note: 'Aguardando avaliação' }]);
    expect(calls).toHaveLength(1);
    expect(host().textContent).not.toContain('próxima mudança');
  });

  it('recusa observações com mais de 255 caracteres', () => {
    pick(); button('Adicionar observação').click(); render();
    const textarea = host().querySelector('textarea')!;
    textarea.value = 'x'.repeat(256); textarea.dispatchEvent(new Event('input'));
    button('Salvar').click(); render();
    expect(host().textContent).toContain('Use até 255 caracteres.');
    expect(calls).toHaveLength(1);
  });

  it('descarta a observação reservada ao desfazer antes de mover outro RMA', () => {
    pick(); button('Adicionar observação').click(); render();
    const textarea = host().querySelector('textarea')!;
    textarea.value = 'Nota do primeiro RMA'; textarea.dispatchEvent(new Event('input'));
    button('Salvar').click(); render();
    request = of(original); button('Desfazer').click(); render();
    const other = buildRma({ id: 2 });
    request = of({ ...other, status: 'TRIAGE' });
    fixture.componentInstance.move('TRIAGE', other); render();
    expect(calls[2]).toEqual({ status: 'TRIAGE', note: '' });
  });

  it('impede envios repetidos enquanto aguarda a API', () => {
    request = new Subject<RmaResponse>();
    pick(); pick();
    expect(calls).toHaveLength(1);
    expect(host().querySelector<HTMLButtonElement>('.custom-select__trigger')?.disabled).toBe(true);
  });

  it('não salva sem permissão ou com a superfície desabilitada', () => {
    fixture.componentRef.setInput('disabled', true); render(); pick();
    expect(calls).toHaveLength(0);
  });
});
