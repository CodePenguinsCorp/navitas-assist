import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { DiagnosisRequest, DiagnosisResponse, RmaResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmaService } from '../../core/services/rma.service';
import { providePermissions } from '../../testing/permission-fixtures';
import { buildRma } from '../../testing/rma-fixtures';
import { RmaDiagnosisComponent } from './rma-diagnosis.component';

const diagnosis: DiagnosisResponse = {
  foundFailure: 'Falha na fonte', failureType: 'POWER_SUPPLY', probableCause: 'COMPONENT', notes: 'Trocar capacitor',
  diagnosedAt: '2026-11-12', technicianName: 'Ana'
};

describe('Diagnóstico inline', () => {
  let fixture: ComponentFixture<RmaDiagnosisComponent>;
  let result: ReturnType<RmaService['upsertDiagnosis']>;
  let calls: DiagnosisRequest[];
  let reads: number;
  const permissions = signal<readonly ['rma.diagnosticar'] | readonly []>(['rma.diagnosticar']);
  const host = () => fixture.nativeElement as HTMLElement;
  const render = () => { fixture.detectChanges(); TestBed.tick(); };
  const button = (label: string) => [...host().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)!;
  const edit = () => { button('Registrar diagnóstico').click(); render(); };
  const fill = (name: string, value: string) => {
    const field = host().querySelector<HTMLInputElement>(`[formControlName="${name}"]`)!;
    field.value = value; field.dispatchEvent(new Event('input')); render();
  };
  const submit = () => { host().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); render(); };

  beforeEach(async () => {
    permissions.set(['rma.diagnosticar']); calls = []; reads = 0;
    result = of(buildRma({ diagnosis }));
    await TestBed.configureTestingModule({
      imports: [RmaDiagnosisComponent],
      providers: [providePermissions(permissions), { provide: AuthService, useValue: { currentUser: () => ({ name: 'Ana', username: 'ana' }) } }, {
        provide: RmaService, useValue: {
          upsertDiagnosis: (_id: number, payload: DiagnosisRequest) => { calls.push(payload); return result; },
          getById: () => { reads++; return of(buildRma({ diagnosis })); }
        }
      }]
    }).compileComponents();
    fixture = TestBed.createComponent(RmaDiagnosisComponent);
    fixture.componentRef.setInput('rma', buildRma());
    fixture.componentInstance.saved.subscribe(rma => fixture.componentRef.setInput('rma', rma));
    render();
  });

  it('expande no cartão, com foco e sem outro diálogo', () => {
    expect(host().textContent).toContain('Sem diagnóstico registrado'); edit();
    expect(host().querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(host().querySelector('[formControlName="foundFailure"]'));
    expect([...host().querySelectorAll('.form-actions button')].map(b => b.textContent?.trim())).toEqual(['Cancelar', 'Salvar diagnóstico']);
    // Date and technician are filled in automatically: no fields for them.
    expect(host().querySelector('[formControlName="technicianName"]')).toBeNull();
    expect(host().querySelector('[formControlName="diagnosedAt"]')).toBeNull();
  });

  it('valida obrigatórios e limites sem chamar a API', () => {
    edit(); fill('foundFailure', 'x'.repeat(2001)); submit();
    expect(host().textContent).toContain('Use até 2000 caracteres.');
    fill('foundFailure', '   '); submit();
    expect(host().textContent).toContain('Descreva a falha encontrada.');
    const field = host().querySelector('[formControlName="foundFailure"]')!;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(host().querySelector('#' + field.getAttribute('aria-describedby'))?.textContent).toContain('Descreva a falha encontrada.');
    expect(calls).toHaveLength(0);
  });

  it('valida o limite de notas previsto no contrato do backend', () => {
    edit(); fill('foundFailure', 'Falha'); fill('notes', 'x'.repeat(2001)); submit();
    expect(host().textContent).toContain('Use até 2000 caracteres.');
    expect(calls).toHaveLength(0);
  });

  it('carrega os seis campos existentes ao editar e descarta mudanças ao cancelar', () => {
    fixture.componentRef.setInput('rma', buildRma({ diagnosis })); render();
    button('Editar').click(); render();
    expect(host().querySelector<HTMLTextAreaElement>('[formControlName="foundFailure"]')?.value).toBe(diagnosis.foundFailure);
    expect(host().querySelector<HTMLTextAreaElement>('[formControlName="notes"]')?.value).toBe(diagnosis.notes);
    fill('foundFailure', 'Rascunho'); button('Cancelar').click(); render();
    expect(host().querySelector('form')).toBeNull();
    expect(host().textContent).toContain(diagnosis.foundFailure);
    expect(document.activeElement).toBe(button('Editar'));
    expect(calls).toHaveLength(0);
  });

  it('salva o mesmo contrato, recarrega a OS e mantém o detalhe aberto', () => {
    edit(); fill('foundFailure', '  Falha na fonte  '); fill('notes', '   '); submit();
    expect(calls).toEqual([expect.objectContaining({ foundFailure: 'Falha na fonte', technicianName: 'Ana', notes: null, failureType: null, probableCause: null })]);
    expect(reads).toBe(1);
    expect(host().querySelector('form')).toBeNull();
    expect(host().textContent).toContain('Falha na fonte');
    expect(button('Editar')).toBeDefined();
  });

  it('mostra a falha inline e preserva o formulário', () => {
    result = throwError(() => ({ error: { message: 'Diagnóstico não salvo.' } }));
    edit(); fill('foundFailure', 'Falha preservada'); submit();
    expect(host().querySelector('[role="alert"]')?.textContent).toContain('Diagnóstico não salvo.');
    expect(host().querySelector<HTMLTextAreaElement>('[formControlName="foundFailure"]')?.value).toBe('Falha preservada');
  });

  it('consome Escape para cancelar apenas a edição', () => {
    edit();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    host().querySelector('textarea')!.dispatchEvent(event); render();
    expect(event.defaultPrevented).toBe(true);
    expect(host().querySelector('form')).toBeNull();
    expect(document.activeElement).toBe(button('Registrar diagnóstico'));
  });

  it('bloqueia duplo envio e cancelamento durante o salvamento', () => {
    result = new Subject<RmaResponse>(); edit(); fill('foundFailure', 'Falha'); submit(); submit();
    expect(calls).toHaveLength(1);
    expect(button('Cancelar').disabled).toBe(true);
  });

  it.each(['COMPLETED', 'RETURNED', 'IRREPARABLE'] as const)('não permite editar OS encerrada em %s', status => {
    fixture.componentRef.setInput('rma', buildRma({ status })); render();
    expect(button('Registrar diagnóstico')).toBeUndefined();
  });

  it('oculta a ação e impede salvar se a permissão for revogada durante a edição', () => {
    edit(); fill('foundFailure', 'Falha'); permissions.set([]); render();
    expect(host().querySelector('form')).toBeNull();
    expect(button('Registrar diagnóstico')).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});
