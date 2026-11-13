import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { PartReplenishmentResponse, PartReservationResponse, PartResponse } from '../../core/models';
import { Permission } from '../../core/permissions';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { PartService } from '../../core/services/part.service';
import { PartsComponent } from './parts.component';

const PART: PartResponse = {
  id: 4, code: 'PCA-1', name: 'Capacitor', unit: 'm', location: 'A1', minimumStock: 8, unitCost: 10,
  onHand: 10, reserved: 4, available: 6, belowMinimum: true, active: true,
  createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z'
};
const INACTIVE: PartResponse = { ...PART, id: 5, code: 'CAB-2', name: 'Cabo', location: 'B2', active: false, onHand: 2, unitCost: 5 };
const REPLENISHMENT: PartReplenishmentResponse = { ...PART, partId: 4, pendingQuantity: 3.5, suggestedQuantity: 12.5 };
const PENDING: PartReservationResponse = {
  id: 2, rmaId: 7, rmaCode: 'RMA-7', partId: 4, partCode: 'PCA-1', partName: 'Capacitor', unit: 'm', location: 'A1',
  quantity: 3.5, status: 'PENDING', partAvailable: 6, unitCost: 10, totalCost: 35, note: null, createdBy: 'tech',
  createdAt: PART.createdAt, updatedAt: PART.updatedAt
};

describe('PartsComponent presentation', () => {
  let fixture: ComponentFixture<PartsComponent>;
  let service: { list: ReturnType<typeof vi.fn>; listReplenishment: ReturnType<typeof vi.fn>; listPending: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  const root = (): HTMLElement => fixture.nativeElement.querySelector('.page-surface');
  const normalized = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const tab = (label: string) => { Array.from(root().querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => normalized(item).startsWith(label))!.click(); render(); };
  const search = (value: string) => {
    const input = root().querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = value; input.dispatchEvent(new Event('input')); render();
  };
  const action = (label: string, scope: Element = root()) => Array.from(scope.querySelectorAll('button')).find((button) => (button.getAttribute('aria-label') ?? button.getAttribute('title') ?? '').startsWith(label));
  const facts = (table: HTMLTableElement, row: number = 0) => {
    const cells = table.querySelectorAll('tbody tr')[row].querySelectorAll('td');
    return new Map(Array.from(table.querySelectorAll('thead th')).map((header, index) => [normalized(header), normalized(cells[index])]));
  };

  async function setup(role: LegacyProfileCode | readonly Permission[] = 'ADMIN', pending = false) {
    const parts = new Subject<PartResponse[]>();
    service = { list: vi.fn(() => pending ? parts : of([PART, INACTIVE])), listReplenishment: vi.fn(() => of([REPLENISHMENT])), listPending: vi.fn(() => of([PENDING])), update: vi.fn(() => of(PART)) };
    await TestBed.configureTestingModule({ imports: [PartsComponent], providers: [
      { provide: PartService, useValue: service },
      providePermissions(typeof role === 'string' ? profilePermissions(role) : role)
    ] }).compileComponents();
    fixture = TestBed.createComponent(PartsComponent); render();
    return parts;
  }

  // A contagem fica no rodapé da lista de estoque; a aba Reposição tem a própria contagem.
  it('counts stock parts at the foot of the list independently of the search field', async () => {
    await setup();
    search('Capacitor');
    expect(normalized(root().querySelector('.result-count'))).toBe('1 de 2 peças');
    expect(normalized(root().querySelector('.search-field'))).not.toContain('registro(s)');
    tab('Reposição');
    expect(root().querySelector('.result-count')).toBeNull();
    tab('Estoque');
    expect(normalized(root().querySelector('.result-count'))).toBe('1 de 2 peças');
  });

  // Vermelho: cartões não identificam o escopo global dos três indicadores.
  it('shows scoped alerts and stock value without statistic cards', async () => {
    const source = await setup('ADMIN', true);
    expect(root().querySelector('.page-summary')).toBeNull();
    source.next([PART, INACTIVE]); source.complete(); render();
    const line = root().querySelector('.page-summary')!;
    expect(normalized(line)).toMatch(/Abaixo do mínimo\s*1/);
    expect(normalized(line)).toMatch(/Reservas pendentes\s*1/);
    expect(normalized(line)).toMatch(/Valor em estoque\s*R\$\s*110,00/);
    expect(root().querySelector('.stat-card')).toBeNull();
    const before = normalized(line);
    search('Capacitor'); expect(normalized(line)).toBe(before);
    tab('Reposição'); expect(normalized(line)).toBe(before);
    service.list.mockReturnValue(throwError(() => new Error()));
    const component = fixture.componentInstance as unknown as { openEditModal(part: PartResponse): void; savePart(): void };
    component.openEditModal(PART); component.savePart(); render();
    expect(normalized(root())).toContain('Não foi possível carregar as peças.');
    expect(root().querySelector('.page-summary')).toBeNull();
    expect(normalized(root())).not.toContain('R$ 110,00');
    expect(root().querySelector('.result-count')).toBeNull();
  });

  // Vermelho: a ação Editar não tem o código e o nome da peça no nome acessível.
  it('names row actions with the part and exposes a focus tooltip', async () => {
    await setup();
    const row = root().querySelector('tbody tr')!;
    const edit = action('Editar', row)!;
    expect(edit.getAttribute('aria-label')).toBe('Editar PCA-1 Capacitor');
    expect(action('Histórico', row)?.getAttribute('aria-label')).toBe('Histórico PCA-1 Capacitor');
    expect(action('Movimentar', row)?.getAttribute('aria-label')).toBe('Movimentar PCA-1 Capacitor');
    edit.focus(); edit.dispatchEvent(new FocusEvent('focus')); render();
    const tooltip = edit.querySelector('[role="tooltip"]');
    expect(normalized(tooltip)).toBe('Editar');
    expect(tooltip?.classList.contains('is-open')).toBe(true);
  });

  // Vermelho: a localização está concatenada à identidade na tabela de reposição.
  it('separates replenishment identity from location', async () => {
    await setup(); tab('Reposição');
    const tables = root().querySelectorAll<HTMLTableElement>('table');
    const headers = Array.from(tables[0].querySelectorAll('th')).map(normalized);
    expect(headers).toContain('Localização');
    const cells = tables[0].querySelectorAll('tbody tr:first-child td');
    expect(normalized(cells[0])).toContain('Capacitor');
    expect(normalized(cells[0])).toContain('PCA-1');
    expect(normalized(cells[0])).not.toContain('A1');
    expect(normalized(cells[headers.indexOf('Localização')])).toBe('A1');
  });

  it('preserves distinct balances, units, minimum and inactive identification', async () => {
    await setup();
    const table = root().querySelector('table')!;
    const values = facts(table);
    expect(values.get('Em estoque')).toBe('10 m');
    expect(values.get('Reservado')).toBe('4 m');
    expect(values.get('Disponível')).toBe('6 m');
    expect(values.get('Mínimo')).toBe('8 m');
    const rows = table.querySelectorAll('tbody tr');
    expect(normalized(rows[0].querySelector('td'))).toContain('Repor');
    expect(normalized(rows[1].querySelector('td'))).toContain('Inativa');
    expect(normalized(rows[1].querySelector('td'))).not.toContain('Repor');
  });

  it('preserves API suggestion and pending quantity, RMA and business date', async () => {
    await setup(); tab('Reposição');
    const tables = root().querySelectorAll<HTMLTableElement>('table');
    const replenishment = facts(tables[0]);
    expect(replenishment.get('Pendente em RMAs')).toBe('3,5 m');
    expect(replenishment.get('Sugestão de compra')).toBe('12,5 m');
    const pending = facts(tables[1]);
    expect(pending.get('RMA')).toBe('RMA-7');
    expect(pending.get('Quantidade')).toBe('3,5 m');
    expect(pending.get('Disponível')).toBe('6 m');
    expect(pending.get('Solicitada em')).toBe('24/10/2026, 09:00');
  });

  it.each(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER'] as LegacyProfileCode[])('preserves stock actions and visible BRL costs for %s', async (role) => {
    await setup(role);
    const row = root().querySelector('tbody tr')!;
    const writable = role === 'ADMIN' || role === 'SERVICE_DESK';
    expect(Array.from(root().querySelectorAll('button')).some((button) => normalized(button).includes('Nova peça'))).toBe(writable);
    expect(Boolean(action('Editar', row))).toBe(writable);
    expect(Boolean(action('Movimentar', row))).toBe(writable);
    expect(Boolean(action('Histórico', row))).toBe(true);
    expect(normalized(row)).toContain('R$ 10,00');
  });

  it.each([
    { permissions: ['pecas.ver', 'pecas.movimentar'] as Permission[], writable: true },
    { permissions: profilePermissions('ADMIN').filter((permission) => permission !== 'pecas.movimentar'), writable: false }
  ])('follows pecas.movimentar alone for stock actions (writable=$writable)', async ({ permissions, writable }) => {
    await setup(permissions);
    const row = root().querySelector('tbody tr')!;
    expect(Array.from(root().querySelectorAll('button')).some((button) => normalized(button).includes('Nova peça'))).toBe(writable);
    expect(Boolean(action('Editar', row))).toBe(writable);
    expect(Boolean(action('Movimentar', row))).toBe(writable);
  });
});
