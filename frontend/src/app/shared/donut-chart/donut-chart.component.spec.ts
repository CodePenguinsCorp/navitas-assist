import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DonutChartComponent } from './donut-chart.component';

@Component({
  imports: [DonutChartComponent],
  template: `<app-donut-chart [slices]="slices" centerLabel="itens" [centerValue]="total" ariaLabel="Garantia" />`
})
class HostComponent {
  slices = [{ label: 'Em garantia', value: 7, tone: 'success' }, { label: 'Fora de garantia', value: 1, tone: 'danger' }, { label: 'Pendente', value: 0, tone: 'slate' }];
  total = 8;
}

describe('DonutChartComponent', () => {
  function render(slices?: HostComponent['slices']) {
    const fixture = TestBed.createComponent(HostComponent);
    if (slices) fixture.componentInstance.slices = slices;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists every slice with value and pt-BR percentage in an accessible table', () => {
    const element = render();
    const rows = Array.from(element.querySelectorAll('tbody tr')).map((row) => Array.from(row.children).map((cell) => cell.textContent?.trim()).join(' '));
    expect(rows).toEqual(['Em garantia 7 87,5%', 'Fora de garantia 1 12,5%', 'Pendente 0 0,0%']);
    expect(element.querySelector('table')?.getAttribute('aria-label')).toBe('Garantia');
    expect(element.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(element.querySelectorAll('path.donut__arc').length).toBe(2);
  });

  it('shows the total in the center and the focused slice in its place', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.donut__value')?.textContent).toBe('8');
    expect(element.querySelector('.donut__label')?.textContent).toBe('itens');
    (element.querySelector('tbody tr') as HTMLElement).dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(element.querySelector('.donut__value')?.textContent).toBe('7');
    expect(element.querySelector('.donut__label')?.textContent).toBe('Em garantia');
  });

  it('shows an empty ring with "Sem dados" when everything is zero', () => {
    const element = render([{ label: 'A', value: 0, tone: 'success' }]);
    expect(element.querySelector('.donut--empty')).not.toBeNull();
    expect(element.querySelector('.donut__label')?.textContent).toBe('Sem dados');
    expect(element.querySelectorAll('path.donut__arc').length).toBe(0);
  });

  it('draws a full ring for a single 100% slice', () => {
    const element = render([{ label: 'A', value: 5, tone: 'success' }]);
    expect(element.querySelectorAll('circle.donut__arc').length).toBe(1);
    expect(element.textContent).toContain('100,0%');
  });
});
