import { TestBed } from '@angular/core/testing';
import { RmaKanbanBoardComponent } from './rma-kanban-board.component';

describe('Kanban WIP counters', () => {
  it('shows global occupancy independently from the visible card count', async () => {
    await TestBed.configureTestingModule({ imports: [RmaKanbanBoardComponent] }).compileComponents();
    const fixture = TestBed.createComponent(RmaKanbanBoardComponent);
    fixture.componentRef.setInput('rmas', []);
    fixture.componentRef.setInput('wipLimits', [{ status: 'TRIAGE', maxItems: 10, blocking: true, currentCount: 9 }]);
    fixture.detectChanges();
    const column = fixture.nativeElement.querySelector('[data-status="TRIAGE"]') as HTMLElement;
    expect(column.textContent).toContain('WIP global: 9/10');
    expect(column.textContent).toContain('Próximo');
    expect(column.querySelectorAll('.board-card')).toHaveLength(0);
    fixture.destroy();
  });
});
