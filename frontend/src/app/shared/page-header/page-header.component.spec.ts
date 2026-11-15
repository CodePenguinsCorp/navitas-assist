import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PageHeaderComponent } from './page-header.component';

@Component({
  imports: [PageHeaderComponent],
  template: `
    <app-page-header heading="Clientes" [backLink]="back" backLabel="Voltar para Clientes">
      <button type="button" class="button-primary">Novo</button>
    </app-page-header>
  `
})
class HostComponent { back: string | null = '/clientes'; }

describe('PageHeaderComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideRouter([])] }).compileComponents();
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

  it('shows the 40px back arrow before the title only when backLink is set', () => {
    const arrow = element.querySelector<HTMLAnchorElement>('.page-heading__title > a.page-heading__back');
    expect(arrow?.getAttribute('href')).toBe('/clientes');
    expect(arrow?.getAttribute('aria-label')).toBe('Voltar para Clientes');
    expect(arrow?.nextElementSibling?.tagName).toBe('H1');
    fixture.componentInstance.back = null;
    fixture.destroy();
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.back = null;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.page-heading__back')).toBeNull();
  });
});
