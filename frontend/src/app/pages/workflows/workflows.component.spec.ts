import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { WorkflowService } from '../../core/services/workflow.service';
import { OperationsService } from '../../core/services/operations.service';
import { WorkflowsComponent } from './workflows.component';

describe('Workflow draft editor', () => {
  const definition = {
    name: 'Original',
    initialStatus: 'NEW',
    statuses: [{ code: 'NEW', label: 'Entrada', active: true, category: 'PENDING', slaStage: 'RECEIVED' }],
    transitions: [],
  };
  let component: WorkflowsComponent;
  let fail: boolean;
  let failPublish: boolean;
  let saved: unknown;
  let publishedRevision: number;
  beforeEach(() => {
    fail = false;
    failPublish = false;
    saved = null;
    publishedRevision = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkflowService,
          useValue: {
            published: () => of({ version: 2, definition }),
            draft: () => of({ publishedVersion: 2, revision: 4, definition }),
            start: () => of({ publishedVersion: 2, revision: 4, definition }),
            save: (revision: number, body: unknown) => {
              saved = { revision, body };
              return fail
                ? throwError(() => ({ error: { message: 'Revisão obsoleta' } }))
                : of({ publishedVersion: 2, revision: 5, definition: body });
            },
            publish: (revision: number) => {
              publishedRevision = revision;
              return failPublish
                ? throwError(() => ({ error: { message: 'Sem saída' } }))
                : of({ version: 3, definition });
            },
            discard: () => of(undefined),
          },
        },
        { provide: OperationsService, useValue: { templates: () => of([]) } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new WorkflowsComponent());
  });
  it('edits a copy isolated from the published document', () => {
    component.definition()!.name = 'Rascunho';
    expect(definition.name).toBe('Original');
    expect(component.published()!.definition.name).toBe('Original');
  });
  it('saves a draft with its revision without claiming publication', () => {
    component.save();
    expect(saved).toEqual({ revision: 4, body: definition });
    expect(component.revision()).toBe(5);
    expect(component.published()!.version).toBe(2);
  });
  it('preserves local changes and revision after a persistence conflict', () => {
    component.definition()!.name = 'Local';
    fail = true;
    component.save();
    expect(component.definition()!.name).toBe('Local');
    expect(component.revision()).toBe(4);
    expect(component.error()).toContain('obsoleta');
  });
  it('publishes the saved revision and retains invalid draft on error', () => {
    failPublish = true;
    component.publish();
    expect(publishedRevision).toBe(5);
    expect(component.definition()).not.toBeNull();
    expect(component.error()).toBeTruthy();
  });
  it('discards the draft without altering the publication', () => {
    component.discard();
    expect(component.definition()).toBeNull();
    expect(component.published()!.version).toBe(2);
  });
  it('archives a status removing incoming transitions while preserving exits', () => {
    component.definition()!.transitions = [
      { from: 'NEW', to: 'DONE', roles: ['ADMIN'], requiredFields: [], conditions: [], actions: [] },
      { from: 'DONE', to: 'NEW', roles: ['ADMIN'], requiredFields: [], conditions: [], actions: [] },
    ];
    component.archive(component.definition()!.statuses[0]);
    expect(component.definition()!.transitions.map((x) => x.from)).toEqual(['NEW']);
  });
  it('keeps transition references when renaming an unpublished generated code', () => {
    component.addStatus();
    const status = component.definition()!.statuses[1];
    component
      .definition()!
      .transitions.push({
        from: 'NEW',
        to: status.code,
        roles: ['ADMIN'],
        requiredFields: [],
        conditions: [],
        actions: [],
      });
    component.source.set(status.code);
    component.rename(status, 'Revisão');
    expect(status.code).toBe('REVISAO');
    expect(component.definition()!.transitions[0].to).toBe('REVISAO');
    expect(component.source()).toBe('REVISAO');
  });
});
