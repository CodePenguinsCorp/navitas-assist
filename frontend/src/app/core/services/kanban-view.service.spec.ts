import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { KanbanViewRequest } from '../models';
import { KanbanViewService } from './kanban-view.service';

describe('KanbanViewService', () => {
  let service: KanbanViewService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(KanbanViewService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('uses the authenticated Kanban view collection', () => {
    service.list().subscribe();
    const list = httpTesting.expectOne('/api/kanban-views');
    expect(list.request.method).toBe('GET');
    list.flush([]);

    service.create(REQUEST).subscribe();
    const create = httpTesting.expectOne('/api/kanban-views');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(REQUEST);
    create.flush({});
  });

  it('updates, selects as default and deletes an owned view', () => {
    service.update(8, REQUEST).subscribe();
    const update = httpTesting.expectOne('/api/kanban-views/8');
    expect(update.request.method).toBe('PUT');
    update.flush({});

    service.setDefault(8).subscribe();
    const setDefault = httpTesting.expectOne('/api/kanban-views/8/default');
    expect(setDefault.request.method).toBe('PATCH');
    expect(setDefault.request.body).toEqual({});
    setDefault.flush({});

    service.delete(8).subscribe();
    const remove = httpTesting.expectOne('/api/kanban-views/8');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
  });
});

const REQUEST: KanbanViewRequest = {
  name: 'Alta prioridade',
  defaultView: false,
  filters: {
    query: null,
    priority: 'HIGH',
    status: null,
    warranty: null,
    assigneeId: null,
    unassignedOnly: false,
    entryFrom: null,
    entryTo: null,
    updatedFrom: null,
    updatedTo: null,
  },
};
