import { Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RmaResponse } from '../../core/models';
import { Permission } from '../../core/permissions';
import { CatalogService } from '../../core/services/catalog.service';
import { KanbanViewService } from '../../core/services/kanban-view.service';
import { RmaService } from '../../core/services/rma.service';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { RmaDetailModalComponent } from '../../shared/rma-detail-modal/rma-detail-modal.component';
import { buildRma } from '../../testing/rma-fixtures';
import { KanbanComponent } from './kanban.component';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';

interface KanbanProfileHarness {
  openDetail(rma: RmaResponse): void;
}

const RMA = buildRma({ id: 1, code: 'NAV-0001', status: 'TRIAGE', assigneeId: 7, assigneeName: 'Técnico Responsável' });

async function setup(role: LegacyProfileCode) {
  return setupWith(profilePermissions(role));
}

async function setupWith(permissions: readonly Permission[] | Signal<readonly Permission[]>) {
  await TestBed.configureTestingModule({
    imports: [KanbanComponent],
    providers: [
      provideRouter([]),
      { provide: SlaClockService, useValue: { now: signal(Date.parse('2026-10-20T12:00:00Z')) } },
      providePermissions(permissions),
      { provide: CatalogService, useValue: { listAssignableUsers: () => of([{ id: 7, username: 'tecnico', fullName: 'Técnico Responsável' }]) } },
      {
        provide: KanbanViewService,
        useValue: { list: () => of([]), create: vi.fn(), update: vi.fn(), setDefault: () => of({}), delete: () => of(undefined) }
      },
      { provide: RmaService, useValue: { listBoard: () => of([RMA]), getById: () => of(RMA) } }
    ]
  }).compileComponents();
  const fixture: ComponentFixture<KanbanComponent> = TestBed.createComponent(KanbanComponent);
  fixture.detectChanges();
  return fixture;
}

describe('KanbanComponent detail permissions by profile', () => {
  it.each([
    ['ADMIN', true, true],
    ['SERVICE_DESK', true, true],
    ['TECHNICIAN', true, false],
    ['VIEWER', false, false]
  ] as const)('passes status and assignee permissions to the detail modal (%s)', async (role, status, assignee) => {
    const fixture = await setup(role);
    (fixture.componentInstance as unknown as KanbanProfileHarness).openDetail(RMA);
    fixture.detectChanges();

    const modal = fixture.debugElement.query(By.directive(RmaDetailModalComponent));
    expect(modal).not.toBeNull();
    const instance = modal.componentInstance as RmaDetailModalComponent;
    expect(instance.canUpdateStatus()).toBe(status);
    expect(instance.canUpdateAssignee()).toBe(assignee);

    const buttons = [...(modal.nativeElement as HTMLElement).querySelectorAll('.rma-detail__actions button')].map((button) => button.textContent?.trim());
    expect((modal.nativeElement as HTMLElement).querySelector('.rma-detail__actions .rma-detail__status .custom-select__trigger') !== null).toBe(status);
    expect((modal.nativeElement as HTMLElement).querySelector('.rma-detail__assignee-picker .custom-select__trigger') !== null).toBe(assignee);
    expect(buttons).toContain('Ver impedimentos');
  });
});

describe('KanbanComponent bulk actions by permission', () => {
  function bulk(fixture: ComponentFixture<KanbanComponent>) {
    const page = fixture.nativeElement as HTMLElement;
    const toolbar = page.querySelector('.bulk-toolbar');
    return {
      page,
      toolbar,
      actions: [...(toolbar?.querySelectorAll('.bulk-buttons button') ?? [])].map((button) => button.textContent?.trim())
        .filter((label) => label?.startsWith('Alterar')),
      checkbox: page.querySelector<HTMLInputElement>('.board-card__selection input'),
    };
  }

  it.each([
    ['ADMIN', ['Alterar status', 'Alterar prioridade', 'Alterar responsável']],
    ['SERVICE_DESK', ['Alterar status', 'Alterar prioridade', 'Alterar responsável']],
    ['TECHNICIAN', ['Alterar status']],
  ] as const)('keeps the bulk actions of %s', async (role, actions) => {
    const view = bulk(await setup(role));

    expect(view.toolbar).not.toBeNull();
    expect(view.actions).toEqual(actions);
    expect(view.checkbox).not.toBeNull();
  });

  it('keeps bulk selection hidden for VIEWER', async () => {
    const view = bulk(await setup('VIEWER'));

    expect(view.toolbar).toBeNull();
    expect(view.checkbox).toBeNull();
  });

  it('offers bulk assignee changes with only rma.responsavel', async () => {
    const fixture = await setupWith(['rma.ver', 'rma.responsavel']);
    const view = bulk(fixture);

    expect(view.toolbar).not.toBeNull();
    expect(view.actions).toEqual(['Alterar responsável']);
    expect(view.checkbox).not.toBeNull();

    view.checkbox!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(view.toolbar!.textContent).toContain('1 RMA selecionado');

    [...view.toolbar!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Limpar seleção'))!.click();
    fixture.detectChanges();
    [...view.toolbar!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Selecionar visíveis'))!.click();
    fixture.detectChanges();
    expect(view.toolbar!.textContent).toContain('1 RMA selecionado');
  });

  it('drops the bulk selection when the bulk permissions are lost', async () => {
    const permissions = signal<readonly Permission[]>(['rma.ver', 'rma.status']);
    const fixture = await setupWith(permissions);
    bulk(fixture).checkbox!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(bulk(fixture).toolbar!.textContent).toContain('1 RMA selecionado');

    permissions.set(['rma.ver']);
    fixture.detectChanges();
    expect(bulk(fixture).toolbar).toBeNull();
    permissions.set(['rma.ver', 'rma.status']);
    fixture.detectChanges();

    expect(bulk(fixture).toolbar!.textContent).not.toContain('1 RMA selecionado');
    expect(bulk(fixture).checkbox!.checked).toBe(false);
  });

  it('offers bulk priority changes with only rma.editar', async () => {
    const view = bulk(await setupWith(['rma.ver', 'rma.editar']));

    expect(view.actions).toEqual(['Alterar prioridade']);
    expect(view.checkbox).not.toBeNull();
  });
});
