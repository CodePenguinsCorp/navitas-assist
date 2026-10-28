import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { KanbanLanePreferencesService } from './kanban-lane-preferences.service';

describe('Kanban lane preferences', () => {
  const currentUser = signal({ username: 'alice' });
  beforeEach(() => {
    localStorage.clear();
    currentUser.set({ username: 'alice' });
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser } }] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('persists collapsed keys and isolates accounts and groupings', () => {
    const service = TestBed.inject(KanbanLanePreferencesService);
    service.toggle('ASSIGNEE', 'assignee:7');
    expect(service.collapsedKeys('ASSIGNEE')).toEqual(['assignee:7']);
    expect(service.collapsedKeys('CLIENT')).toEqual([]);
    currentUser.set({ username: 'bob' });
    expect(service.collapsedKeys('ASSIGNEE')).toEqual([]);
    TestBed.resetTestingModule();
    currentUser.set({ username: 'alice' });
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser } }] });
    expect(TestBed.inject(KanbanLanePreferencesService).collapsedKeys('ASSIGNEE')).toEqual(['assignee:7']);
  });

  it('ignores corrupt data and still collapses in memory when browser storage is unavailable', () => {
    localStorage.setItem('navitas.kanban.lanes:alice:CLIENT', '{"bad":true}');
    const service = TestBed.inject(KanbanLanePreferencesService);
    expect(service.collapsedKeys('CLIENT')).toEqual([]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied'); });
    service.toggle('CLIENT', 'client:1');
    expect(service.collapsedKeys('CLIENT')).toEqual(['client:1']);
    service.toggle('CLIENT', 'client:1');
    expect(service.collapsedKeys('CLIENT')).toEqual([]);
  });
});
