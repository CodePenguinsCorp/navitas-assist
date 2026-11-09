import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { LoadingService } from './core/services/loading.service';

@Component({ template: '<button type="button">Atualizar</button><div aria-busy="true"></div>' })
class LoadingPage {}

describe('App global loading', () => {
  let fixture: ComponentFixture<App>;
  let loading: LoadingService;
  let content: HTMLElement;
  let button: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([{ path: '', component: LoadingPage }])] }).compileComponents();
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();
    loading = TestBed.inject(LoadingService);
    const root = fixture.nativeElement as HTMLElement;
    const outlet = root.querySelector('router-outlet');
    expect(outlet, 'the real root template must render its router outlet').not.toBeNull();
    content = outlet!.parentElement!;
    expect(content.parentElement).toBe(root);
    // Exercise focus on connected routed content, as in the live root.
    button = content.querySelector('button')!;
    expect(button, 'the test route must be mounted inside the root content').not.toBeNull();
    expect(button.isConnected).toBe(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('blocks background interaction, exposes busy state and restores focus without focusing the overlay', () => {
    button.focus();
    expect(document.activeElement).toBe(button);
    loading.start();
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    expect(content.hasAttribute('inert')).toBe(true);
    expect(content.getAttribute('aria-busy')).toBe('true');
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(content.querySelector('[aria-busy="true"]')?.textContent).toBe('');
    expect(content.textContent).not.toContain('Carregando');
    expect(fixture.nativeElement.querySelectorAll('[role="status"]')).toHaveLength(1);
    const status = fixture.nativeElement.querySelector('app-loading-overlay [role="status"]');
    expect(status?.textContent.trim()).toBe('Carregando...');
    expect(content.contains(status)).toBe(false);
    // Simulate the browser blurring an element after it becomes inert.
    button.blur();
    loading.finish();
    vi.advanceTimersByTime(400);
    fixture.detectChanges();
    expect(content.hasAttribute('inert')).toBe(false);
    expect(content.getAttribute('aria-busy')).toBe('false');
    expect(content.hasAttribute('aria-hidden')).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('leaves focus and interaction alone for fast requests', () => {
    button.focus();
    loading.start();
    fixture.detectChanges();
    expect(content.getAttribute('aria-busy')).toBe('true');
    expect(content.hasAttribute('inert')).toBe(false);
    vi.advanceTimersByTime(199);
    loading.finish();
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(content.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(fixture.nativeElement.querySelector('app-loading-overlay [role="status"]')).toBeNull();
  });

  it('does not restore focus to an element removed during loading', () => {
    button.focus();
    loading.start();
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    button.remove();
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();
    loading.finish();
    vi.advanceTimersByTime(400);
    fixture.detectChanges();
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('covers an existing native modal, prevents Escape dismissal and restores its focused control', () => {
    const underlying = document.createElement('dialog');
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Fechar';
    underlying.append(closeButton);
    content.append(underlying);
    underlying.showModal();
    closeButton.focus();
    loading.start();
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    const blocker = fixture.nativeElement.querySelector('dialog.global-loading-dialog') as HTMLDialogElement | null;
    const statuses = fixture.nativeElement.querySelectorAll('[role="status"]');
    expect(statuses).toHaveLength(1);
    expect(statuses[0].closest('[inert], [aria-hidden="true"]')).toBeNull();
    expect(blocker?.open).toBe(true);
    const cancel = new Event('cancel', { cancelable: true });
    blocker!.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(blocker!.open).toBe(true);
    loading.finish();
    vi.advanceTimersByTime(400);
    fixture.detectChanges();
    expect(blocker!.open).toBe(false);
    expect(underlying.open).toBe(true);
    expect(document.activeElement).toBe(closeButton);
    underlying.close();
  });
});
