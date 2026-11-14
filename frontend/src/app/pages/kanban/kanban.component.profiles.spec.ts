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
import { ClockService } from '../../core/services/clock.service';
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
      { provide: ClockService, useValue: { now: signal(Date.parse('2026-10-20T12:00:00Z')) } },
      providePermissions(permissions),
      { provide: CatalogService, useValue: { listAssignableUsers: () => of([{ id: 7, username: 'tecnico', fullName: 'Técnico Responsável' }]) } },
      {
        provide: KanbanViewService,
        useValue: { list: () => of([]), create: vi.fn(), update: vi.fn(), setDefault: () => of({}), delete: () => of(undefined) }
      },
      { provide: RmaService, useValue: { listBoard: () => of([RMA]), getById: () => of(RMA), updatePriority: (id: number, priority: RmaResponse['priority']) => of({ ...RMA, id, priority }) } }
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

    const buttons = [...(modal.nativeElement as HTMLElement).querySelectorAll('.detail-actions button')].map((button) => button.textContent?.trim());
    expect((modal.nativeElement as HTMLElement).querySelector('.detail-actions .rma-detail__status .custom-select__trigger') !== null).toBe(status);
    expect((modal.nativeElement as HTMLElement).querySelector('.rma-detail__assignee-picker .custom-select__trigger') !== null).toBe(assignee);
    expect(buttons).not.toContain('Ver impedimentos');
    expect((modal.nativeElement as HTMLElement).querySelector('app-rma-blocks-section')).not.toBeNull();
  });
});

describe('KanbanComponent priority from the detail', () => {
  it('updates the card when the priority changes in the detail modal', async () => {
    const fixture = await setup('ADMIN');
    const page = fixture.nativeElement as HTMLElement;
    const cardPriority = () => page.querySelector('.board-card .priority-tag')!;
    expect(cardPriority().getAttribute('data-priority')).toBe(RMA.priority);
    const next = RMA.priority === 'HIGH' ? 'Baixa' : 'Alta';
    (fixture.componentInstance as unknown as KanbanProfileHarness).openDetail(RMA);
    fixture.detectChanges();

    page.querySelector<HTMLButtonElement>('app-rma-detail-modal app-rma-priority-field .custom-select__trigger')!.click();
    fixture.detectChanges();
    [...page.querySelectorAll<HTMLButtonElement>('app-rma-priority-field .custom-select__option')].find((option) => option.textContent?.includes(next))!.click();
    fixture.detectChanges();

    expect(cardPriority().textContent?.trim()).toBe(next);
  });
});
