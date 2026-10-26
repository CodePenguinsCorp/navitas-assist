import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PageResponse, UserAccountResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService, UserFilters } from '../../core/services/catalog.service';
import { UsersComponent } from './users.component';

function user(id: number, fullName: string): UserAccountResponse {
  return {
    id, username: `user${id}`, fullName, role: 'TECHNICIAN', active: true,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  };
}

function page(content: UserAccountResponse[], pageNumber = 0, size = 20, totalElements = content.length): PageResponse<UserAccountResponse> {
  return { content, page: pageNumber, size, totalElements, totalPages: Math.ceil(totalElements / size) };
}

describe('UsersComponent pagination', () => {
  let component: UsersHarness;
  let fixture: ComponentFixture<UsersComponent>;
  let listUsers: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    listUsers = vi.fn((filters: UserFilters) => of(page([user(1, 'Ana'), user(2, 'Bia')], filters.page, filters.size, 45)));

    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        { provide: AuthService, useValue: { currentUser: () => ({ username: 'admin' }), hasAnyRole: () => true } },
        { provide: CatalogService, useValue: {
          listUsers,
          getUserSummary: () => of({ total: 45, active: 40, admins: 3, roles: 4 }),
          deleteUser: () => of(undefined)
        } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance as unknown as UsersHarness;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('loads the first page with total and summary', () => {
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', role: undefined, active: undefined });
    expect(fixture.nativeElement.textContent).toContain('45 registro(s)');
    expect(fixture.nativeElement.textContent).toContain('Página 1 de 3');
  });

  it('combines role and status filters with navigation', () => {
    component.updateRoleFilter('TECHNICIAN');
    component.updateStatusFilter('inactive');
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', role: 'TECHNICIAN', active: false });

    component.goToPage(2);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 2, size: 20, query: '', role: 'TECHNICIAN', active: false });

    component.updateStatusFilter('active');
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', role: 'TECHNICIAN', active: true });
  });

  it('debounces the text search and honors the page size', () => {
    listUsers.mockClear();
    component.updateSearch('an');
    component.updateSearch('ana');
    vi.advanceTimersByTime(300);
    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: 'ana', role: undefined, active: undefined });

    component.changePageSize(100);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 100, query: 'ana', role: undefined, active: undefined });
  });
});

interface UsersHarness {
  updateSearch(value: string): void;
  updateRoleFilter(value: UserRole | ''): void;
  updateStatusFilter(value: 'all' | 'active' | 'inactive'): void;
  goToPage(page: number): void;
  changePageSize(size: number): void;
}
