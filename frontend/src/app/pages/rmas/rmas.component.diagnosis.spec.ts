import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { DiagnosisRequest, DiagnosisResponse, RmaResponse, UserRole, UserSession } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { RmaService } from '../../core/services/rma.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { buildRma, buildRmaPage } from '../../testing/rma-fixtures';
import { RmasComponent } from './rmas.component';

type UpsertFn = (id: number, payload: DiagnosisRequest) => Observable<RmaResponse>;

interface DiagnosisHarness {
  diagnosisForm: FormGroup;
  pageError(): string;
  openDetailsModal(rma: RmaResponse): void;
  openDiagnosisModal(): void;
  closeModal(): void;
  saveDiagnosis(): void;
}

const existingDiagnosis: DiagnosisResponse = {
  id: 9, foundFailure: 'Capacitor estufado', failureType: 'POWER_SUPPLY', probableCause: 'COMPONENT',
  notes: 'Trocar lote', diagnosedAt: '2026-10-21', technicianName: 'Bia',
  createdAt: '2026-10-21T12:00:00Z', updatedAt: '2026-10-21T12:00:00Z'
};

const rmaWithoutDiagnosis = buildRma({ reportedFailure: 'Não liga após queda' });
const rmaWithDiagnosis = buildRma({ reportedFailure: 'Não liga após queda', diagnosis: existingDiagnosis });

async function setup(options: { role?: UserRole; rma?: RmaResponse; upsert?: UpsertFn } = {}) {
  const role = options.role ?? 'ADMIN';
  const rma = options.rma ?? rmaWithoutDiagnosis;
  const rmaService = {
    list: vi.fn(() => of(buildRmaPage([rma], 0, 20, 1))),
    getSummary: vi.fn(() => of({ total: 1, ongoing: 1, highPriority: 0 })),
    history: vi.fn(() => of([])),
    getById: vi.fn(),
    create: vi.fn(),
    upsertDiagnosis: vi.fn(options.upsert ?? ((id: number, payload: DiagnosisRequest) =>
      of(buildRma({ id, reportedFailure: rma.reportedFailure, diagnosis: { ...existingDiagnosis, ...payload } }))))
  };
  const currentUser = signal<UserSession | null>({ username: 'tester', name: 'Tester', role });
  await TestBed.configureTestingModule({
    imports: [RmasComponent],
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { currentUser: currentUser.asReadonly(), hasAnyRole: (roles: UserRole[]) => roles.includes(role) }
      },
      { provide: CatalogService, useValue: { listClientOptions: () => of([]), listProductOptions: () => of([]) } },
      { provide: RmaService, useValue: rmaService },
      { provide: ProtocolService, useValue: { listExecutions: () => of([]), listTemplates: () => of([]) } }
    ]
  }).compileComponents();
  const fixture: ComponentFixture<RmasComponent> = TestBed.createComponent(RmasComponent);
  fixture.detectChanges();
  const component = fixture.componentInstance as unknown as DiagnosisHarness;
  const page = fixture.nativeElement as HTMLElement;
  const render = () => fixture.detectChanges();

  const openDetail = () => {
    component.openDetailsModal(rma);
    render();
  };
  const open = () => {
    openDetail();
    component.openDiagnosisModal();
    render();
  };
  /** The open diagnosis panel, found without relying on its dialog role. */
  const panel = () => page.querySelector<HTMLElement>('.modal-overlay .modal-panel');
  const dialog = () => page.querySelector<HTMLElement>('.modal-overlay [role="dialog"]');
  const alertText = () => dialog()?.querySelector('[role="alert"]')?.textContent?.trim() ?? null;
  const submit = () => {
    panel()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    render();
  };
  const fillValid = () => {
    component.diagnosisForm.patchValue({ foundFailure: 'Falha mantida', technicianName: 'Ana' });
    render();
  };

  return { fixture, component, page, render, rmaService, openDetail, open, panel, dialog, alertText, submit, fillValid };
}

describe('RmasComponent diagnosis dialog', () => {
  it('groups the diagnosis into Falha encontrada, Registro and Notas', async () => {
    // Hoje o diálogo é uma grade plana sem fieldset, o rótulo é "Data" e não há role="dialog".
    const { page, open, panel } = await setup();
    open();
    const form = panel()!.querySelector('form')!;
    const sections = [...form.querySelectorAll<HTMLElement>(':scope > fieldset.form-section > legend')];

    expect(sections.map((legend) => legend.textContent?.trim())).toEqual(['Falha encontrada', 'Registro', 'Notas']);
    const expected = [['foundFailure', 'failureType', 'probableCause'], ['diagnosedAt', 'technicianName'], ['notes']];
    sections.forEach((legend, index) => {
      for (const control of expected[index]) {
        expect(legend.parentElement!.querySelectorAll(`[formControlName="${control}"]`).length, control).toBe(1);
      }
    });
    const labels = [...form.querySelectorAll('label')].map((label) => label.textContent?.trim());
    expect(labels).toContain('Data do diagnóstico');
    expect(labels).not.toContain('Data');

    const panelElement = panel()!;
    expect(panelElement.getAttribute('role')).toBe('dialog');
    expect(panelElement.getAttribute('aria-modal')).toBe('true');
    expect(page.querySelector(`#${panelElement.getAttribute('aria-labelledby')}`)?.textContent?.trim()).toBe('Diagnóstico');
  });

  it('shows the reported failure as read-only context', async () => {
    // Hoje o diálogo mostra só o código; a falha relatada não aparece.
    const { open, panel } = await setup();
    open();
    const context = panel()!.querySelector<HTMLElement>('.rma-diagnosis__context');

    expect(panel()!.textContent).toContain('Não liga após queda');
    expect(context?.textContent).toContain('Falha relatada');
    expect(context?.textContent).toContain('Não liga após queda');
    expect(context!.querySelector('[formControlName], input, textarea')).toBeNull();
    expect(panel()!.textContent).toContain(rmaWithoutDiagnosis.code);
    expect(panel()!.textContent).toContain(rmaWithoutDiagnosis.clientName);
  });

  it('shows field errors and the banner inside the dialog after an invalid submit', async () => {
    // Hoje "Preencha os campos obrigatórios do diagnóstico." vai para .status-card fora do diálogo e não há mensagem por campo.
    const { component, page, open, render, submit, panel, alertText, rmaService } = await setup();
    open();
    component.diagnosisForm.patchValue({ foundFailure: '', technicianName: '' });
    render();
    submit();

    const text = panel()!.textContent ?? '';
    expect(text).toContain('Descreva a falha encontrada.');
    expect(text).toContain('Informe o técnico.');
    expect(alertText()).toBe('Preencha os campos obrigatórios do diagnóstico.');
    expect(page.querySelector('.status-card')).toBeNull();
    expect(rmaService.upsertDiagnosis).not.toHaveBeenCalled();
  });

  it('shows length errors for found failure and technician', async () => {
    // Hoje 2001 e 121 caracteres não mostram mensagem.
    const { component, open, render, submit, panel } = await setup();
    open();
    component.diagnosisForm.controls['foundFailure'].setValue('x'.repeat(2001));
    component.diagnosisForm.controls['technicianName'].setValue('x'.repeat(121));
    render();
    submit();

    const text = panel()!.textContent ?? '';
    expect(text).toContain('Use até 2000 caracteres.');
    expect(text).toContain('Use até 120 caracteres.');
    expect(text).not.toContain('Descreva a falha encontrada.');
  });

  it('shows the save error inside the dialog and keeps the values', async () => {
    // Hoje a falha do serviço vai para .status-card fora do diálogo.
    const error = new HttpErrorResponse({ status: 400, error: { message: 'Diagnóstico não salvo' } });
    const { component, page, open, submit, alertText, fillValid } = await setup({ upsert: () => throwError(() => error) });
    open();
    fillValid();
    submit();

    expect(alertText()).toBe('Diagnóstico não salvo');
    expect(page.querySelector('.status-card')).toBeNull();
    expect(component.diagnosisForm.controls['foundFailure'].value).toBe('Falha mantida');
  });

  it('clears the dialog message on reopen, on a corrected resubmit and on a new pending attempt', async () => {
    // Hoje a mensagem fica em pageError e continua na página durante o novo envio.
    let pending = new Subject<RmaResponse>();
    const error = new HttpErrorResponse({ status: 400, error: { message: 'Diagnóstico não salvo' } });
    const { component, open, render, submit, alertText, fillValid } = await setup({ upsert: () => pending });

    open();
    component.diagnosisForm.patchValue({ foundFailure: '' });
    render();
    submit();
    expect(alertText()).toBe('Preencha os campos obrigatórios do diagnóstico.');
    component.closeModal();
    open();
    expect(alertText()).toBeNull();

    // Inválido, corrigido e reenviado com a requisição pendente.
    component.diagnosisForm.patchValue({ foundFailure: '' });
    render();
    submit();
    expect(alertText()).toBe('Preencha os campos obrigatórios do diagnóstico.');
    fillValid();
    submit();
    expect(alertText()).toBeNull();

    // Falha do serviço e nova tentativa pendente.
    pending.error(error);
    render();
    expect(alertText()).toBe('Diagnóstico não salvo');
    pending = new Subject<RmaResponse>();
    submit();
    expect(alertText()).toBeNull();
  });

  it('labels the header action by diagnosis state', async () => {
    // Hoje o botão do cabeçalho diz "Diagnóstico" nos dois casos.
    const headerAction = (page: HTMLElement) =>
      page.querySelector('.rma-details__header-actions .button-primary')?.textContent?.trim();

    const without = await setup();
    without.openDetail();
    expect(headerAction(without.page)).toBe('Registrar diagnóstico');

    TestBed.resetTestingModule();
    const withDiagnosis = await setup({ rma: rmaWithDiagnosis });
    withDiagnosis.openDetail();
    expect(headerAction(withDiagnosis.page)).toBe('Editar diagnóstico');
  });

  it('sends the same diagnosis payload', async () => {
    const { component, open, render, submit, rmaService } = await setup();
    open();
    component.diagnosisForm.setValue({
      foundFailure: '  Falha X  ', failureType: '', probableCause: '', notes: '   ',
      diagnosedAt: '2026-10-21', technicianName: '  Ana  '
    });
    render();
    submit();

    expect(rmaService.upsertDiagnosis).toHaveBeenCalledWith(rmaWithoutDiagnosis.id, {
      foundFailure: 'Falha X', failureType: null, probableCause: null, notes: null,
      diagnosedAt: '2026-10-21', technicianName: 'Ana'
    });
  });

  it('primes the form from the existing diagnosis and defaults the technician to the operator', async () => {
    const withDiagnosis = await setup({ rma: rmaWithDiagnosis });
    withDiagnosis.open();
    expect(withDiagnosis.component.diagnosisForm.getRawValue()).toEqual({
      foundFailure: 'Capacitor estufado', failureType: 'POWER_SUPPLY', probableCause: 'COMPONENT',
      notes: 'Trocar lote', diagnosedAt: '2026-10-21', technicianName: 'Bia'
    });

    TestBed.resetTestingModule();
    const without = await setup();
    without.open();
    expect(without.component.diagnosisForm.controls['foundFailure'].value).toBe('');
    expect(without.component.diagnosisForm.controls['technicianName'].value).toBe('Tester');
  });

  it.each([
    ['ADMIN', true], ['TECHNICIAN', true], ['SERVICE_DESK', false], ['VIEWER', false]
  ] as const)('gives the diagnosis action to %s: %s', async (role, allowed) => {
    const { component, page, render, openDetail, panel } = await setup({ role });
    openDetail();
    expect(page.querySelector('.rma-details__header-actions .button-primary') !== null).toBe(allowed);
    [...page.querySelectorAll<HTMLButtonElement>('.tab')].find((tab) => tab.textContent?.trim() === 'Diagnóstico')!.click();
    render();
    const cta = [...page.querySelectorAll('.rma-details__panel button')]
      .some((button) => button.textContent?.trim() === 'Registrar diagnóstico');
    expect(cta).toBe(allowed);

    component.openDiagnosisModal();
    render();
    const diagnosisOpen = panel()?.querySelector('[formControlName="foundFailure"]') != null;
    expect(diagnosisOpen).toBe(allowed);
    if (!allowed) expect(component.pageError()).toBe('Seu perfil não pode registrar diagnóstico técnico.');
  });

  it.each([
    ['ADMIN', true], ['TECHNICIAN', true], ['SERVICE_DESK', false], ['VIEWER', false]
  ] as const)('limits a direct saveDiagnosis call for %s', async (role, allowed) => {
    const { component, openDetail, fillValid, rmaService } = await setup({ role });
    openDetail();
    fillValid();
    component.saveDiagnosis();

    expect(rmaService.upsertDiagnosis).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (!allowed) expect(component.pageError()).toBe('Seu perfil não pode registrar diagnóstico técnico.');
  });

  it('shows Cancelar before Salvar diagnóstico', async () => {
    const { open, panel } = await setup();
    open();
    expectCancelBeforePrimary(panel()!);
  });
});
