import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PartReplenishmentResponse, PartReservationResponse, PartResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PartService } from '../../core/services/part.service';
import { PartsComponent } from './parts.component';

const PART: PartResponse = {
  id: 4, code: 'PCA-1', name: 'Capacitor', unit: 'm', location: 'A1', minimumStock: 8, unitCost: 10,
  onHand: 10, reserved: 4, available: 6, belowMinimum: true, active: true,
  createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
};
const REPLENISHMENT: PartReplenishmentResponse = { ...PART, partId: PART.id, pendingQuantity: 3, suggestedQuantity: 5 };
const PENDING: PartReservationResponse = {
  id: 2, rmaId: 7, rmaCode: 'RMA-7', partId: 4, partCode: 'PCA-1', partName: 'Capacitor', unit: 'm', location: 'A1',
  quantity: 3, status: 'PENDING', partAvailable: 6, unitCost: 10, totalCost: 30, note: null, createdBy: 'tech',
  createdAt: PART.createdAt, updatedAt: PART.updatedAt
};

type Harness = { [K in 'openCreateModal' | 'closeModals' | 'savePart' | 'retryLoad']: () => void } & {
  openEditModal(part: PartResponse): void;
};

describe('PartsComponent snapshot loading', () => {
  let fixture: ComponentFixture<PartsComponent>;
  let component: Harness;
  let service: { list: ReturnType<typeof vi.fn>; listReplenishment: ReturnType<typeof vi.fn>; listPending: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  const root = (): HTMLElement => fixture.nativeElement.querySelector('.page-surface');
  const text = () => {
    const snapshot = root().cloneNode(true) as HTMLElement;
    snapshot.querySelector('.alert-banner--success')?.remove();
    return snapshot.textContent!.replace(/\s+/g, ' ').trim();
  };
  const button = (label: string) => Array.from(root().querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const tab = (label: string) => { Array.from(root().querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => item.textContent?.trim().startsWith(label))!.click(); render(); };
  const refresh = () => { component.openEditModal(PART); component.savePart(); render(); };
  const search = (value: string) => {
    const input = root().querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    render();
    return input;
  };

  async function setup(sources: { role?: UserRole; parts?: Observable<PartResponse[]>; replenishment?: Observable<PartReplenishmentResponse[]>; pending?: Observable<PartReservationResponse[]> } = {}) {
    service = {
      list: vi.fn(() => sources.parts ?? of([PART])),
      listReplenishment: vi.fn(() => sources.replenishment ?? of([REPLENISHMENT])),
      listPending: vi.fn(() => sources.pending ?? of([PENDING])),
      update: vi.fn(() => of(PART))
    };
    await TestBed.configureTestingModule({ imports: [PartsComponent], providers: [
      { provide: PartService, useValue: service },
      { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(sources.role ?? 'ADMIN') } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(PartsComponent);
    component = fixture.componentInstance as unknown as Harness;
    render();
  }

  // Vermelho: Reposição apresenta vazios e contagem zero enquanto as três fontes estão pendentes.
  it('never reports empty replenishment before the first response', async () => {
    await setup({ parts: new Subject(), replenishment: new Subject(), pending: new Subject() });
    tab('Reposição');
    expect(text()).toContain('Carregando peças...');
    expect(text()).not.toContain('Nenhuma peça abaixo do mínimo');
    expect(text()).not.toContain('Nenhuma reserva aguardando saldo');
    expect(text()).not.toContain('R$');
    expect(button('Reposição (0)')).toBeUndefined();
  });

  // Vermelho: a falha mantém dados ou vazio no corpo em vez de um estado de erro recuperável.
  it.each((['list', 'listReplenishment', 'listPending'] as const).flatMap((source) => ['initial', 'data', 'empty'].map((previous) => ({ source, previous }))))('replaces both tabs after $source fails ($previous)', async ({ source, previous }) => {
    const failure = throwError(() => new Error());
    if (previous === 'initial') {
      await setup({ parts: source === 'list' ? failure : of([]), replenishment: source === 'listReplenishment' ? failure : of([]), pending: source === 'listPending' ? failure : of([]) });
    } else {
      await setup({ parts: of(previous === 'data' ? [PART] : []), replenishment: of(previous === 'data' ? [REPLENISHMENT] : []), pending: of(previous === 'data' ? [PENDING] : []) });
      service[source].mockReturnValue(failure);
      refresh();
    }
    for (const label of ['Estoque', 'Reposição']) {
      tab(label);
      expect(text()).toContain('Não foi possível carregar as peças.');
      expect(text()).not.toContain('Nenhuma peça cadastrada');
      expect(text()).not.toContain('Nenhuma peça abaixo do mínimo');
      expect(text()).not.toContain('Nenhuma reserva aguardando saldo');
      expect(text()).not.toContain('Capacitor');
      expect(text()).not.toContain('R$');
    }
  });

  // Vermelho: abrir o formulário apaga o erro de leitura e não há nova tentativa no corpo.
  it('keeps failure after opening and closing a form', async () => {
    await setup({ parts: throwError(() => new Error()) });
    component.openCreateModal(); render(); component.closeModals(); render();
    expect(text()).toContain('Tentar novamente');
    expect(text()).toContain('Não foi possível carregar as peças.');
  });

  // Vermelho: falta a ação de retry desabilitada, mantendo falha e ocultando respostas parciais.
  it('retries the complete snapshot without publishing partial arrays', async () => {
    await setup({ parts: throwError(() => new Error()) });
    const parts = new Subject<PartResponse[]>();
    const replenishment = new Subject<PartReplenishmentResponse[]>();
    const pending = new Subject<PartReservationResponse[]>();
    service.list.mockReturnValue(parts); service.listReplenishment.mockReturnValue(replenishment); service.listPending.mockReturnValue(pending);
    button('Tentar novamente')?.click(); render();
    parts.next([PART]); parts.complete(); render();
    expect(button('Carregando...')?.disabled).toBe(true);
    expect(text()).toContain('Não foi possível carregar as peças.');
    expect(text()).not.toContain('Capacitor');
    replenishment.next([REPLENISHMENT]); replenishment.complete(); render();
    expect(text()).not.toContain('Capacitor');
    pending.next([PENDING]); pending.complete(); render();
    expect(text()).toContain('Capacitor');
    expect(text()).not.toContain('Tentar novamente');
    for (const method of ['list', 'listReplenishment', 'listPending'] as const) expect(service[method]).toHaveBeenCalledTimes(2);
  });

  // Vermelho: uma resposta antiga pode sobrescrever a recarga mais recente.
  it('keeps only the latest complete refresh', async () => {
    await setup();
    const old = new Subject<PartResponse[]>();
    const current = new Subject<PartResponse[]>();
    service.list.mockReturnValueOnce(old).mockReturnValueOnce(current);
    refresh(); refresh();
    current.next([{ ...PART, name: 'Peça atual' }]); current.complete(); render();
    old.next([{ ...PART, name: 'Peça antiga' }]); old.complete(); render();
    expect(text()).toContain('Peça atual');
    expect(text()).not.toContain('Peça antiga');
  });

  // Vermelho: uma carga substituída continua inscrita e não há feedback de atualização.
  it('cancels the replaced load without releasing the next loading state and cancels on destroy', async () => {
    await setup();
    const old = new Subject<PartResponse[]>();
    const current = new Subject<PartResponse[]>();
    service.list.mockReturnValueOnce(old).mockReturnValueOnce(current);
    refresh(); refresh(); old.complete(); render();
    expect(text()).toContain('Atualizando estoque...');
    expect(old.observed).toBe(false);
    expect(current.observed).toBe(true);
    fixture.destroy();
    expect(current.observed).toBe(false);
  });

  // Vermelho: busca vazia não oferece limpeza local.
  it('clearSearch restores the local list without another request', async () => {
    await setup();
    const input = search('inexistente');
    expect(text()).toContain('Nenhuma peça encontrada');
    button('Limpar busca')?.click(); render();
    expect(input.value).toBe('');
    expect(text()).toContain('Capacitor');
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('preserves immediate code, name and location search and tab changes without HTTP', async () => {
    await setup();
    for (const query of ['PCA-1', 'capacitor', 'a1']) { search(query); expect(text()).toContain('Capacitor'); }
    tab('Reposição'); expect(text()).toContain('RMA-7'); tab('Estoque');
    for (const method of ['list', 'listReplenishment', 'listPending'] as const) expect(service[method]).toHaveBeenCalledTimes(1);
  });

  it('preserves atomic publication on the first successful load', async () => {
    const parts = new Subject<PartResponse[]>();
    const replenishment = new Subject<PartReplenishmentResponse[]>();
    const pending = new Subject<PartReservationResponse[]>();
    await setup({ parts, replenishment, pending });
    parts.next([PART]); parts.complete(); render(); expect(text()).not.toContain('Capacitor');
    replenishment.next([REPLENISHMENT]); replenishment.complete(); render(); expect(text()).not.toContain('Capacitor');
    pending.next([PENDING]); pending.complete(); render(); expect(text()).toContain('Capacitor');
  });

  it.each(['ADMIN', 'VIEWER'] as UserRole[])('preserves a real empty catalog for %s', async (role) => {
    await setup({ role, parts: of([]), replenishment: of([]), pending: of([]) });
    expect(text()).toContain('Nenhuma peça cadastrada');
    tab('Reposição');
    expect(text()).toContain('Nenhuma peça abaixo do mínimo');
    expect(text()).toContain('Nenhuma reserva aguardando saldo');
  });
});
