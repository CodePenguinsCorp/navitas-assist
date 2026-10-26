import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { WipService } from '../../core/services/wip.service';
import { KanbanWipSettingsComponent } from './kanban-wip-settings.component';

describe('WIP settings', () => {
  it('prevents nonadmin edits and saves a valid admin configuration', async () => {
    const admin = signal(false);
    const update = vi.fn(() => of({ status: 'TRIAGE', maxItems: 2, blocking: true, currentCount: 1 }));
    await TestBed.configureTestingModule({ imports: [KanbanWipSettingsComponent], providers: [
      { provide: AuthService, useValue: { hasAnyRole: () => admin() } }, { provide: WipService, useValue: { update } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(KanbanWipSettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component['save']();
    expect(update).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    admin.set(true);
    fixture.detectChanges();
    component['form'].patchValue({ status: 'TRIAGE', maxItems: 2, blocking: true });
    component['save']();
    expect(update).not.toHaveBeenCalled();
    fixture.componentRef.setInput('limits', ['RECEIVED', 'TRIAGE', 'IN_DIAGNOSIS', 'WAITING_PART', 'IN_REPAIR', 'IN_TESTS'].map(status => ({ status, maxItems: null, blocking: false, currentCount: 0 })));
    fixture.detectChanges();
    component['open']();
    component['form'].patchValue({ status: 'TRIAGE', maxItems: 0, blocking: true });
    component['save']();
    expect(update).not.toHaveBeenCalled();
    component['form'].patchValue({ maxItems: 1.5 });
    component['save']();
    expect(update).not.toHaveBeenCalled();
    component['form'].patchValue({ maxItems: 2 });
    component['save']();
    expect(update).toHaveBeenCalledWith('TRIAGE', { maxItems: 2, blocking: true });
    fixture.destroy();
  });
});
