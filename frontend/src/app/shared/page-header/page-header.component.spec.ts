import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageHeaderComponent } from './page-header.component';

@Component({
  imports: [PageHeaderComponent],
  template: `
    <app-page-header heading="Clientes">
      <button type="button" class="button-primary">Novo</button>
    </app-page-header>
  `
})
class HostComponent {}

describe('PageHeaderComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders the heading as h1 inside .page-heading and projects the action', () => {
    const heading = element.querySelector('.page-heading');
    expect(heading?.querySelector('h1')?.textContent?.trim()).toBe('Clientes');
    expect(heading?.querySelector('.shell-actions button.button-primary')?.textContent?.trim()).toBe('Novo');
  });

  it('does not render a record count next to the title', () => {
    const heading = element.querySelector('.page-heading');
    expect(heading?.querySelector('.page-heading__count')).toBeNull();
    expect(heading?.querySelector('.page-heading__title')?.textContent?.trim()).toBe('Clientes');
  });

  it('does not set a native title attribute on the host', () => {
    expect(element.querySelector('app-page-header')?.hasAttribute('title')).toBe(false);
  });
});
