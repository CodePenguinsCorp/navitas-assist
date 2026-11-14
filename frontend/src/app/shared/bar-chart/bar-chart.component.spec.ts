import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BarChartComponent } from './bar-chart.component';

@Component({ imports: [BarChartComponent], template: `<app-bar-chart [rows]="rows" ariaLabel="Por status" />` })
class HostComponent {
  rows: { label: string; value: number }[] = [{ label: 'Recebida', value: 4 }, { label: 'Devolvida', value: 1 }];
}

describe('BarChartComponent', () => {
  it('shows label and value as text and scales bars to the largest', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('table')?.getAttribute('aria-label')).toBe('Por status');
    expect(Array.from(element.querySelectorAll('tbody tr')).map((row) => Array.from(row.children).slice(0, 2).map((cell) => cell.textContent?.trim()).join(' '))).toEqual(['Recebida 4', 'Devolvida 1']);
    const widths = Array.from(element.querySelectorAll<HTMLElement>('.bars__bar')).map((bar) => bar.style.width);
    expect(widths).toEqual(['100%', '25%']);
  });

  it('shows the empty message without rows', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.rows = [];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem dados no período.');
  });
});
