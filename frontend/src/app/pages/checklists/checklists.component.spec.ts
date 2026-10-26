import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { OperationsService } from '../../core/services/operations.service';
import { ChecklistsComponent } from './checklists.component';
describe('Checklist templates', () => {
  let c: ChecklistsComponent;
  let payload: any;
  let fail: boolean;
  const template = {
    id: 1,
    code: 'QUALITY',
    name: 'Qualidade',
    active: true,
    version: 3,
    items: [{ code: 'TEST', label: 'Testar', required: true }],
  };
  beforeEach(() => {
    fail = false;
    payload = null;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OperationsService,
          useValue: {
            templates: () => of([template]),
            saveTemplate: (body: any) => {
              payload = body;
              return fail
                ? throwError(() => ({ error: { message: 'Versão obsoleta' } }))
                : of({ ...body, id: 1, version: 4 });
            },
          },
        },
      ],
    });
    c = TestBed.runInInjectionContext(() => new ChecklistsComponent());
  });
  it('copies the template and submits the expected version', () => {
    c.edit(template);
    c.editor()!.name = 'Nova';
    c.save();
    expect(template.name).toBe('Qualidade');
    expect(payload.expectedVersion).toBe(3);
    expect(c.templates()[0].version).toBe(4);
  });
  it('requires at least one mandatory item', () => {
    c.edit(template);
    c.editor()!.items[0].required = false;
    c.save();
    expect(payload).toBeNull();
    expect(c.error()).toContain('obrigatório');
  });
  it('retains local edits when a version conflict occurs', () => {
    c.edit(template);
    c.editor()!.name = 'Local';
    fail = true;
    c.save();
    expect(c.editor()!.name).toBe('Local');
    expect(c.error()).toContain('obsoleta');
  });
  it('generates a unique item code after removing an earlier item', () => {
    c.edit();
    c.add();
    c.editor()!.items.splice(0, 1);
    c.add();
    const codes = c.editor()!.items.map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
