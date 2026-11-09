import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RmaResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { KanbanViewService } from '../../core/services/kanban-view.service';
import { RmaService } from '../../core/services/rma.service';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { RmaDetailModalComponent } from '../../shared/rma-detail-modal/rma-detail-modal.component';
import { buildRma } from '../../testing/rma-fixtures';
import { KanbanComponent } from './kanban.component';

interface KanbanProfileHarness {
  openDetail(rma: RmaResponse): void;
}

const RMA = buildRma({ id: 1, code: 'NAV-0001', status: 'TRIAGE', assigneeId: 7, assigneeName: 'Técnico Responsável' });

async function setup(role: UserRole) {
  await TestBed.configureTestingModule({
    imports: [KanbanComponent],
    providers: [
      provideRouter([]),
      { provide: SlaClockService, useValue: { now: signal(Date.parse('2026-10-20T12:00:00Z')) } },
      { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(role) } },
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
    expect(buttons.includes('Trocar responsável')).toBe(assignee);
    expect(buttons).toContain('Ver impedimentos');
  });
});
