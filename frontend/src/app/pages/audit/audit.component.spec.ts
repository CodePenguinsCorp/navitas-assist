import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject, of, throwError } from 'rxjs';
import { AuditComponent } from './audit.component';
import { AuditService } from '../../core/services/audit.service';
import { AuditEventResponse, PageResponse } from '../../core/models';
import { CustomSelectComponent } from '../../shared/form-controls/custom-select/custom-select.component';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

const event: AuditEventResponse = { id: 1, occurredAt: '2026-11-13T02:30:00Z', actorUsername: 'admin', action: 'UPDATE', entityType: 'USER', entityId: 42, entityLabel: null, summary: 'Campos alterados: nome.' };
const page = (content = [event]): PageResponse<AuditEventResponse> => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: content.length ? 1 : 0 });

describe('AuditComponent', () => {
  let fixture: ComponentFixture<AuditComponent>;
  let service: { search: ReturnType<typeof vi.fn> };
  const text = () => fixture.nativeElement.textContent as string;
  const button = (label: string) => [...fixture.nativeElement.querySelectorAll('button')].find((el: any) => el.textContent.trim() === label) as HTMLButtonElement;
  beforeEach(() => {
    service = { search: vi.fn().mockReturnValue(of(page())) };
    TestBed.configureTestingModule({ imports: [AuditComponent], providers: [{ provide: AuditService, useValue: service }] });
  });
  const create = () => { fixture = TestBed.createComponent(AuditComponent); fixture.detectChanges(); };

  it('renders Portuguese labels, record fallback and the business timezone', () => {
    create();
    expect(text()).toContain('Edição');
    expect(text()).toContain('Usuário #42');
    expect(text()).toContain('12/11/2026, 23:30');
    expect(text()).toContain('Campos alterados: nome.');
  });

  it('applies every filter, resets the page and clears filters', () => {
    create();
    const actor = fixture.nativeElement.querySelector('input');
    actor.value = 'operador'; actor.dispatchEvent(new Event('input'));
    const dates = fixture.debugElement.queryAll(By.directive(DatePickerComponent));
    dates[0].componentInstance.selectDay({ iso: '2026-11-01' });
    dates[1].componentInstance.selectDay({ iso: '2026-11-13' });
    const selects = fixture.debugElement.queryAll(By.directive(CustomSelectComponent));
    // ControlValueAccessor follows the same selection path used by the menu.
    selects[0].componentInstance.selectOption({ value: 'UPDATE' });
    selects[1].componentInstance.selectOption({ value: 'USER' });
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    expect(service.search).toHaveBeenLastCalledWith({ page: 0, size: 20, actor: 'operador', from: '2026-11-01', to: '2026-11-13', action: 'UPDATE', entityType: 'USER' });
    button('Limpar filtros').click();
    expect(service.search).toHaveBeenLastCalledWith({ page: 0, size: 20, actor: '', from: '', to: '', action: '', entityType: '' });
  });

  it('requests another page and changes page size', () => {
    create();
    const pagination = fixture.debugElement.query(By.directive(PaginationComponent)).componentInstance;
    pagination.pageChange.emit(1);
    expect(service.search).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, size: 20 }));
    pagination.sizeChange.emit(50);
    expect(service.search).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, size: 50 }));
  });

  it('paginates using the applied filters while a new search is being edited', () => {
    create();
    const actor = fixture.nativeElement.querySelector('input');
    actor.value = 'pending'; actor.dispatchEvent(new Event('input'));
    fixture.debugElement.query(By.directive(PaginationComponent)).componentInstance.pageChange.emit(1);
    expect(service.search).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, actor: '' }));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    expect(service.search).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, actor: 'pending' }));
  });

  it('shows loading and then the empty state without stale rows', () => {
    const response = new Subject<PageResponse<AuditEventResponse>>();
    service.search.mockReturnValue(response); create();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeTruthy();
    response.next(page([])); response.complete(); fixture.detectChanges();
    expect(text()).toContain('Nenhum evento encontrado');
    expect(fixture.nativeElement.querySelector('tbody')).toBeNull();
  });

  it('preserves the backend occurrence code and retries a failed request', () => {
    service.search.mockReturnValue(throwError(() => ({ error: { message: 'Erro inesperado. Informe o código ABCD1234 ao suporte.' } })));
    create();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('ABCD1234');
    service.search.mockReturnValue(of(page())); button('Tentar novamente').click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(text()).toContain('Usuário #42');
  });
});
