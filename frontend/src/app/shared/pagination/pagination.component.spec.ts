import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginationComponent } from './pagination.component';

@Component({
  imports: [PaginationComponent],
  template: `
    @if (labelled()) {
      <app-pagination singular="cliente" plural="clientes" [page]="page()" [size]="20" [totalElements]="total()"
        [totalPages]="totalPages()" [shown]="shown()" (pageChange)="pages.push($event)" (sizeChange)="sizes.push($event)" />
    } @else {
      <app-pagination [page]="page()" [size]="20" [totalElements]="total()" [totalPages]="totalPages()" [shown]="shown()" />
    }
  `
})
class HostComponent {
  readonly labelled = signal(true);
  readonly page = signal(0);
  readonly total = signal(45);
  readonly totalPages = signal(3);
  readonly shown = signal(20);
  readonly pages: number[] = [];
  readonly sizes: number[] = [];
}

describe('PaginationComponent', () => {
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

  function summary(total: number, shown: number, totalPages = Math.ceil(total / 20)): string {
    host.total.set(total);
    host.shown.set(shown);
    host.totalPages.set(totalPages);
    fixture.detectChanges();
    return element.querySelector('.pagination__summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  const button = (text: string) => [...element.querySelectorAll<HTMLButtonElement>('button')]
    .find((item) => item.textContent?.trim() === text)!;

  it('names the total with the entity, using the singular only for exactly one', () => {
    expect(summary(0, 0)).toBe('0 de 0 clientes');
    expect(summary(1, 1)).toBe('1–1 de 1 cliente');
    expect(summary(2, 2)).toBe('1–2 de 2 clientes');
    expect(element.textContent).not.toContain('registro(s)');
  });

  it('falls back to registro/registros for consumers without labels', () => {
    host.labelled.set(false);
    expect(summary(1, 1)).toBe('1–1 de 1 registro');
    expect(summary(45, 20)).toBe('1–20 de 45 registros');
  });

  it('keeps the range, the position and the page events', () => {
    host.page.set(1);
    expect(summary(45, 20)).toBe('21–40 de 45 clientes');
    expect(element.textContent).toContain('Página 2 de 3');

    button('Próxima').click();
    button('Anterior').click();
    expect(host.pages).toEqual([2, 0]);
  });
});
