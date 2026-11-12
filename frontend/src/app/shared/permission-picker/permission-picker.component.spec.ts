import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Permission } from '../../core/permissions';
import { PERMISSION_CATALOG } from '../../testing/profile-fixtures';
import { PermissionPickerComponent, PermissionPickerMode } from './permission-picker.component';

@Component({
  imports: [PermissionPickerComponent],
  template: `
    <app-permission-picker
      [catalog]="catalog"
      [mode]="mode()"
      [locked]="locked()"
      [disabled]="disabled()"
      [(selected)]="selected"
      [(expanded)]="expanded"
    />
  `
})
class HostComponent {
  readonly catalog = PERMISSION_CATALOG;
  readonly mode = signal<PermissionPickerMode>('profile');
  readonly locked = signal<ReadonlySet<string>>(new Set());
  readonly disabled = signal(false);
  readonly selected = signal<ReadonlySet<Permission>>(new Set());
  readonly expanded = signal(false);
}

describe('PermissionPickerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let element: HTMLElement;

  async function mount(setup: (host: HostComponent) => void = () => undefined): Promise<void> {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    setup(host);
    element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    fixture.detectChanges();
  }

  afterEach(() => element?.remove());

  const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const modules = () => Array.from(element.querySelectorAll<HTMLFieldSetElement>('fieldset.permission-module'));
  const row = (label: string) => Array.from(element.querySelectorAll<HTMLLabelElement>('label.permission-row'))
    .find((item) => text(item.querySelector('.permission-row__label')) === label)!;
  const switchOf = (label: string) => row(label).querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const counter = (index: number) => text(modules()[index].querySelector('.permission-module__count'));
  const moduleAction = (index: number, label: string) => Array.from(modules()[index].querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => text(button) === label)!;
  const toggleButton = () => element.querySelector<HTMLButtonElement>('button[aria-controls]')!;
  const panel = () => element.querySelector<HTMLElement>('.permission-picker__panel')!;
  const chips = () => Array.from(element.querySelectorAll('.permission-chip')).map((chip) => text(chip.querySelector('.permission-chip__label')));
  const render = () => fixture.detectChanges();

  describe('profile mode', () => {
    it('renders one fieldset per module, with name, counter and a switch per permission', async () => {
      await mount((h) => h.selected.set(new Set<Permission>(['rma.ver', 'rma.status', 'pecas.ver'])));
      expect(modules().map((set) => text(set.querySelector('legend .permission-module__name')))).toEqual([
        'RMAs', 'Clientes e produtos', 'Peças', 'Protocolos técnicos', 'Relatórios', 'Administração'
      ]);
      expect([0, 1, 2].map(counter)).toEqual(['2 de 8', '0 de 2', '1 de 3']);
      const switches = Array.from(element.querySelectorAll<HTMLInputElement>('fieldset.permission-module input[type="checkbox"]'));
      expect(switches.length).toBe(20);
      expect(switches.every((input) => input.getAttribute('role') === 'switch')).toBe(true);
      expect(text(element.querySelector('.permission-picker__total'))).toBe('3 de 20 selecionadas');
      expect(panel().hidden).toBe(false);
      expect(toggleButton()).toBeNull();
    });

    it('toggles a permission and updates the counters', async () => {
      await mount();
      switchOf('Abrir RMAs').click();
      render();
      expect([...host.selected()]).toEqual(['rma.abrir']);
      expect(counter(0)).toBe('1 de 8');
      expect(row('Abrir RMAs').classList).toContain('is-on');
      switchOf('Abrir RMAs').click();
      render();
      expect(host.selected().size).toBe(0);
      expect(counter(0)).toBe('0 de 8');
    });

    it('marks all and clears a module without touching the others', async () => {
      await mount((h) => h.selected.set(new Set<Permission>(['relatorios.ver'])));
      moduleAction(2, 'Marcar todas').click();
      render();
      expect([...host.selected()].sort()).toEqual(['pecas.movimentar', 'pecas.reservar', 'pecas.ver', 'relatorios.ver']);
      expect(counter(2)).toBe('3 de 3');
      expect(moduleAction(2, 'Marcar todas').disabled).toBe(true);
      moduleAction(2, 'Limpar').click();
      render();
      expect([...host.selected()]).toEqual(['relatorios.ver']);
      expect(moduleAction(2, 'Limpar').disabled).toBe(true);
    });

    it('filters the permissions locally, ignoring case and accents', async () => {
      await mount();
      const filter = element.querySelector<HTMLInputElement>('input[type="search"]')!;
      filter.value = 'RESPONSAVEL';
      filter.dispatchEvent(new Event('input'));
      render();
      expect(modules().map((set) => text(set.querySelector('.permission-module__name')))).toEqual(['RMAs']);
      expect(modules()[0].querySelectorAll('label.permission-row').length).toBe(2);
      // The module name also matches: the whole module stays.
      filter.value = 'pecas';
      filter.dispatchEvent(new Event('input'));
      render();
      expect(modules().map((set) => text(set.querySelector('.permission-module__name')))).toEqual(['Peças']);
      expect(modules()[0].querySelectorAll('label.permission-row').length).toBe(3);
      filter.value = 'nada assim';
      filter.dispatchEvent(new Event('input'));
      render();
      expect(modules().length).toBe(0);
      expect(text(element.querySelector('.permission-picker__empty'))).toBe('Nenhuma permissão encontrada.');
    });

    it('keeps the switches as native, tabbable checkboxes so Space toggles them', async () => {
      await mount();
      const input = switchOf('Ver relatórios');
      input.focus();
      expect(document.activeElement).toBe(input);
      expect(input.tabIndex).toBe(0);
      expect(input.closest('label')).toBe(row('Ver relatórios'));
      // Space on a focused checkbox fires its click activation.
      input.click();
      render();
      expect(host.selected().has('relatorios.ver')).toBe(true);
    });

    it('disables every control while disabled', async () => {
      await mount((h) => h.disabled.set(true));
      const controls = Array.from(element.querySelectorAll<HTMLInputElement | HTMLButtonElement>('fieldset.permission-module input, fieldset.permission-module button'));
      expect(controls.length).toBeGreaterThan(20);
      expect(controls.every((control) => control.disabled)).toBe(true);
    });
  });

  describe('extras mode', () => {
    const extras = (h: HostComponent, selected: Permission[] = []) => {
      h.mode.set('extras');
      h.locked.set(new Set(['rma.ver', 'rma.abrir']));
      h.selected.set(new Set(selected));
    };

    it('shows profile permissions on, locked and badged; the others free', async () => {
      await mount((h) => extras(h, ['rma.status']));
      const locked = switchOf('Abrir RMAs');
      expect(locked.checked).toBe(true);
      expect(locked.disabled).toBe(true);
      expect(row('Abrir RMAs').classList).toContain('is-locked');
      expect(text(row('Abrir RMAs').querySelector('.permission-badge'))).toBe('Do perfil');
      expect(row('Abrir RMAs').querySelector('.permission-badge app-icon')).not.toBeNull();
      const extra = row('Alterar status');
      expect(extra.classList).toContain('is-extra');
      expect(extra.querySelector('.permission-badge')).toBeNull();
      const free = switchOf('Atribuir responsável');
      expect(free.checked).toBe(false);
      expect(free.disabled).toBe(false);
      expect(counter(0)).toBe('3 de 8');
    });

    it('starts collapsed with a toggle wired to the panel', async () => {
      await mount((h) => extras(h));
      expect(panel().hidden).toBe(true);
      expect(toggleButton().getAttribute('aria-expanded')).toBe('false');
      expect(toggleButton().getAttribute('aria-controls')).toBe(panel().id);
      expect(text(toggleButton())).toBe('Editar permissões extras');
      expect(text(element.querySelector('.permission-picker__summary'))).toBe('Nenhuma permissão extra');
      expect(chips()).toEqual([]);
    });

    it('expands, moves focus into the panel and collapses again', async () => {
      await mount((h) => extras(h));
      toggleButton().click();
      render();
      await fixture.whenStable();
      expect(host.expanded()).toBe(true);
      expect(panel().hidden).toBe(false);
      expect(toggleButton().getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(panel().querySelector('input[type="search"]'));
      toggleButton().click();
      render();
      expect(host.expanded()).toBe(false);
      expect(panel().hidden).toBe(true);
    });

    it('lists the granted extras as chips, without the profile ones, and removes them', async () => {
      await mount((h) => extras(h, ['pecas.reservar', 'rma.status', 'rma.ver']));
      expect(chips()).toEqual(['Alterar status', 'Reservar e aplicar peças nos RMAs']);
      expect(text(element.querySelector('.permission-picker__summary'))).toBe('2 permissões extras');
      expect(text(element.querySelector('.permission-picker__total'))).toBe('2 do perfil e 2 extras');
      const remove = element.querySelector<HTMLButtonElement>('.permission-chip button')!;
      expect(remove.getAttribute('aria-label')).toBe('Remover Alterar status');
      remove.click();
      render();
      expect([...host.selected()].sort()).toEqual(['pecas.reservar', 'rma.ver']);
      expect(chips()).toEqual(['Reservar e aplicar peças nos RMAs']);
      expect(text(element.querySelector('.permission-picker__summary'))).toBe('1 permissão extra');
    });

    it('ignores toggles on locked permissions and hides module actions', async () => {
      // An extra the profile also grants stays stored (it comes back if the profile changes).
      await mount((h) => extras(h, ['rma.abrir']));
      switchOf('Abrir RMAs').click();
      render();
      const locked = switchOf('Abrir RMAs');
      locked.checked = false;
      locked.dispatchEvent(new Event('change'));
      render();
      expect([...host.selected()]).toEqual(['rma.abrir']);
      expect(chips()).toEqual([]);
      expect(modules()[0].querySelector('.permission-module__actions')).toBeNull();
    });

    it('disables the chip removal while disabled', async () => {
      await mount((h) => { extras(h, ['rma.status']); h.disabled.set(true); });
      expect(element.querySelector<HTMLButtonElement>('.permission-chip button')!.disabled).toBe(true);
    });
  });
});
