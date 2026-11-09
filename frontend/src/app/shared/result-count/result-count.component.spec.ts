import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResultCountComponent } from './result-count.component';

@Component({
  imports: [ResultCountComponent],
  template: `<app-result-count singular="cliente" plural="clientes" [count]="count()" [total]="total()" />`
})
class HostComponent {
  readonly count = signal<number | null>(null);
  readonly total = signal<number | null>(null);
}

describe('ResultCountComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  function show(count: number | null, total: number | null = null): string | null {
    host.count.set(count);
    host.total.set(total);
    fixture.detectChanges();
    return element.querySelector('.result-count')?.textContent?.trim() ?? null;
  }

  it('hides the count while count is null', () => {
    expect(show(null)).toBeNull();
    expect(show(null, 45)).toBeNull();
  });

  it('uses singular for one and plural otherwise', () => {
    expect(show(1)).toBe('1 cliente');
    expect(show(45)).toBe('45 clientes');
    expect(show(0)).toBe('0 clientes');
  });

  it('shows "X de Y" only when total is greater than count', () => {
    expect(show(12, 45)).toBe('12 de 45 clientes');
    expect(show(12, 0)).toBe('12 clientes');
    expect(show(12, 12)).toBe('12 clientes');
    expect(show(12, null)).toBe('12 clientes');
  });
});
