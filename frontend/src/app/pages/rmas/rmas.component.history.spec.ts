import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { RmaResponse, UserSession } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { RmaService } from '../../core/services/rma.service';
import { buildRma, buildRmaPage } from '../../testing/rma-fixtures';
import { RmasComponent } from './rmas.component';

type HistoryFn = (filters: { batchNumber?: string; serialNumber?: string }) => Observable<RmaResponse[]>;

async function setup(history: HistoryFn = () => of([])) {
  const rmaService = {
    list: vi.fn(() => of(buildRmaPage([buildRma()], 0, 20, 1))),
    getSummary: vi.fn(() => of({ total: 1, ongoing: 1, highPriority: 0 })),
    history: vi.fn(history),
    getById: vi.fn(),
    create: vi.fn(),
    upsertDiagnosis: vi.fn()
  };
  const currentUser = signal<UserSession | null>({ username: 'tester', name: 'Tester', role: 'ADMIN' });
  await TestBed.configureTestingModule({
    imports: [RmasComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: currentUser.asReadonly(), hasAnyRole: () => true } },
      { provide: CatalogService, useValue: { listClientOptions: () => of([]), listProductOptions: () => of([]) } },
      { provide: RmaService, useValue: rmaService },
      { provide: ProtocolService, useValue: { listExecutions: () => of([]), listTemplates: () => of([]) } }
    ]
  }).compileComponents();
  const fixture = TestBed.createComponent(RmasComponent);
  fixture.detectChanges();
  const page = fixture.nativeElement as HTMLElement;
  const render = () => fixture.detectChanges();

  const consult = (batch: string, serial: string) => {
    for (const [name, value] of [['batchNumber', batch], ['serialNumber', serial]]) {
      const input = page.querySelector<HTMLInputElement>(`input[formControlName="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    page.querySelector('input[formControlName="batchNumber"]')!.closest('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    render();
  };

  return { page, render, rmaService, consult };
}

const results = [
  buildRma({ id: 1, code: 'RMA-2026-000001' }),
  buildRma({ id: 2, code: 'RMA-2026-000002', clientName: 'Outro cliente' })
];

describe('RmasComponent history by batch or serial', () => {
  it('labels the history panel and its fields', async () => {
    // Hoje o título é "Histórico" e o rótulo do campo é "Serial".
    const { page } = await setup();
    expect(page.textContent).toContain('Histórico por lote ou série');
    const panel = page.querySelector<HTMLElement>('section.rma-history')!;
    expect(panel.getAttribute('aria-labelledby')).toBe('rma-history-title');
    expect(panel.querySelector('h2#rma-history-title')?.textContent?.trim()).toBe('Histórico por lote ou série');
    const labels = [...panel.querySelectorAll('label')].map((label) => label.textContent?.trim());
    expect(labels).toContain('Série');
    expect(labels).not.toContain('Serial');
  });

  it('reports results with the right plural', async () => {
    // Hoje as mensagens são "1 registro(s) encontrados." e "Nenhum histórico encontrado.".
    let answer: RmaResponse[] = [];
    const { page, consult } = await setup(() => of(answer));
    const status = () => page.querySelector('.rma-history [role="status"]')?.textContent?.trim();

    answer = results.slice(0, 1);
    consult('L1', '');
    expect(page.textContent).not.toContain('registro(s) encontrados');
    expect(status()).toBe('1 RMA encontrado');

    answer = results;
    consult('L1', '');
    expect(status()).toBe('2 RMAs encontrados');

    answer = [];
    consult('L1', '');
    expect(page.textContent).not.toContain('Nenhum histórico encontrado');
    expect(status()).toBe('Nenhum RMA encontrado para este lote ou série.');
  });

  it('announces a history error', async () => {
    // Hoje o erro aparece em p.field-error sem role.
    const error = new HttpErrorResponse({ status: 500, error: { message: 'Falha no histórico' } });
    const { page, consult } = await setup(() => throwError(() => error));
    consult('L1', '');

    expect(page.querySelector('.rma-history [role="alert"]')?.textContent).toContain('Falha no histórico');
  });

  it('asks for a batch or serial on an empty submit', async () => {
    // Hoje o envio vazio não mostra nenhum texto.
    const { page, consult, rmaService } = await setup();
    consult('   ', '');

    expect(page.textContent).toContain('Informe o lote ou a série.');
    expect(rmaService.history).not.toHaveBeenCalled();
  });

  it('shows progress while consulting', async () => {
    // Hoje o botão só desabilita e continua com o texto "Consultar".
    const pending$ = new Subject<RmaResponse[]>();
    const { page, consult } = await setup(() => pending$);
    consult('L1', '');
    const button = page.querySelector<HTMLButtonElement>('input[formControlName="batchNumber"]')!
      .closest('form')!.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    expect(button.textContent?.trim()).toBe('Consultando...');
    expect(button.disabled).toBe(true);
  });

  it('sends normalized parameters for batch, serial and both', async () => {
    const { consult, rmaService } = await setup();

    consult('  L1  ', '');
    expect(rmaService.history).toHaveBeenLastCalledWith({ batchNumber: 'L1', serialNumber: undefined });
    consult('', ' S1 ');
    expect(rmaService.history).toHaveBeenLastCalledWith({ batchNumber: undefined, serialNumber: 'S1' });
    consult('L1', 'S1');
    expect(rmaService.history).toHaveBeenLastCalledWith({ batchNumber: 'L1', serialNumber: 'S1' });
  });

  it('does not call the service for blank input and clears previous results', async () => {
    const { page, consult, rmaService } = await setup(() => of(results));
    consult('L1', '');
    expect(page.querySelectorAll('.history-item').length).toBe(2);

    consult('   ', '  ');
    expect(rmaService.history).toHaveBeenCalledTimes(1);
    expect(page.querySelectorAll('.history-item').length).toBe(0);
  });

  it('opens the selected result in the detail', async () => {
    const { page, render, consult } = await setup(() => of(results));
    consult('L1', '');

    page.querySelectorAll<HTMLButtonElement>('.history-item')[1].click();
    render();
    expect(page.querySelector('.rma-details__code')?.textContent?.trim()).toBe('RMA-2026-000002');
  });
});
