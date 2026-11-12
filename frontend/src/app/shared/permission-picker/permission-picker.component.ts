import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { PermissionItem, PermissionModuleResponse } from '../../core/models';
import { Permission, isPermission } from '../../core/permissions';
import { IconComponent, IconName } from '../icon/icon.component';

/** `profile`: todas editáveis. `extras`: as do perfil (`locked`) ficam ligadas e travadas; o resto é extra. */
export type PermissionPickerMode = 'extras' | 'profile';

interface VisibleModule {
  module: PermissionModuleResponse;
  items: PermissionItem[];
}

const MODULE_ICONS: Record<string, IconName> = {
  RMA: 'clipboard',
  CADASTROS: 'building',
  PECAS: 'box',
  PROTOCOLOS: 'checklist',
  RELATORIOS: 'chart',
  ADMINISTRACAO: 'shield'
};

let nextPanelId = 0;

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

@Component({
  selector: 'app-permission-picker',
  imports: [IconComponent],
  templateUrl: './permission-picker.component.html',
  styles: [`
    :host { display: grid; gap: var(--space-3); grid-column: 1 / -1; min-width: 0; }
    .permission-picker__head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
    .permission-picker__granted { display: grid; gap: var(--space-2); flex: 1 1 260px; min-width: 0; }
    .permission-picker__summary { display: flex; align-items: center; min-height: var(--control-height-xs); font-weight: var(--font-weight-semibold); }
    .permission-picker__summary.is-empty { color: var(--muted); font-weight: var(--font-weight-regular); }
    .permission-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
    .permission-picker__panel { display: grid; gap: var(--space-3); min-width: 0; }
    .permission-picker__panel[hidden] { display: none; }
    .permission-picker__tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); }
    .permission-picker__filter { flex: 0 1 320px; min-width: 0; }
    .permission-picker__total, .permission-picker__empty { margin: 0; color: var(--muted); font-size: var(--font-size-md); font-variant-numeric: tabular-nums; }
    .permission-picker__grid {
      display: grid; gap: var(--space-3); align-items: start;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, max(240px, (100% - 2 * var(--space-3)) / 3)), 1fr));
    }
    .permission-module {
      display: flex; flex-wrap: wrap; align-items: center; column-gap: var(--space-2);
      min-width: 0; margin: 0; padding: var(--space-2);
      border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface);
    }
    .permission-module > legend {
      float: left; flex: 1 1 auto; display: flex; align-items: center; gap: var(--space-2); min-width: 0;
      min-height: var(--control-height); padding: 0 var(--space-1); color: var(--brand-dark);
    }
    .permission-module__tile {
      display: grid; place-items: center; flex-shrink: 0; width: 28px; height: 28px;
      border-radius: var(--radius-sm); background: var(--brand-tint); color: var(--brand-blue);
    }
    .permission-module__heading { display: grid; line-height: var(--line-height-tight); }
    .permission-module__name { font-weight: var(--font-weight-semibold); }
    .permission-module__count { color: var(--muted); font-size: var(--font-size-sm); font-variant-numeric: tabular-nums; }
    .permission-module__actions { display: flex; flex: 1 1 100%; gap: var(--space-4); margin-top: calc(var(--space-2) * -1); padding-left: 40px; }
    .permission-module > .permission-row { flex: 1 1 100%; }
  `]
})
export class PermissionPickerComponent {
  private readonly injector = inject(Injector);
  private readonly filterInput = viewChild<ElementRef<HTMLInputElement>>('filterInput');

  readonly catalog = input.required<readonly PermissionModuleResponse[]>();
  readonly mode = input<PermissionPickerMode>('profile');
  /** Permissões que o perfil já concede (modo `extras`). */
  readonly locked = input<ReadonlySet<string>>(new Set());
  readonly disabled = input(false);
  readonly selected = model<ReadonlySet<Permission>>(new Set());
  /** Painel aberto no modo `extras`; no modo `profile` ele fica sempre aberto. */
  readonly expanded = model(false);

  protected readonly panelId = `permission-picker-${++nextPanelId}`;
  protected readonly query = signal('');

  private readonly allItems = computed(() => this.catalog().flatMap((module) => module.permissions));

  protected readonly visibleModules = computed<VisibleModule[]>(() => {
    const query = normalize(this.query().trim());
    return this.catalog()
      .map((module) => ({
        module,
        items: !query || normalize(module.label).includes(query)
          ? module.permissions
          : module.permissions.filter((item) => normalize(item.label).includes(query))
      }))
      .filter((entry) => entry.items.length > 0);
  });

  /** Extras concedidas que o perfil não inclui, na ordem do catálogo. */
  protected readonly grantedExtras = computed(() =>
    this.allItems().filter((item) => this.isSelected(item.code) && !this.isLocked(item.code)));

  protected readonly summary = computed(() => {
    const count = this.grantedExtras().length;
    return count === 0 ? 'Nenhuma permissão extra' : count === 1 ? '1 permissão extra' : `${count} permissões extras`;
  });

  protected readonly total = computed(() => {
    const items = this.allItems();
    if (this.mode() === 'profile') {
      return `${items.filter((item) => this.isSelected(item.code)).length} de ${items.length} selecionadas`;
    }
    const fromProfile = items.filter((item) => this.isLocked(item.code)).length;
    const extras = this.grantedExtras().length;
    return `${fromProfile} do perfil e ${extras} ${extras === 1 ? 'extra' : 'extras'}`;
  });

  protected iconFor(module: string): IconName {
    return MODULE_ICONS[module] ?? 'shield';
  }

  protected isLocked(code: string): boolean {
    return this.mode() === 'extras' && this.locked().has(code);
  }

  protected isSelected(code: string): boolean {
    return isPermission(code) && this.selected().has(code);
  }

  protected isOn(code: string): boolean {
    return this.isLocked(code) || this.isSelected(code);
  }

  protected onCount(module: PermissionModuleResponse): number {
    return module.permissions.filter((item) => this.isOn(item.code)).length;
  }

  protected toggle(code: string, checked: boolean): void {
    if (this.isLocked(code)) {
      return;
    }
    this.update([code], checked);
  }

  protected setModule(module: PermissionModuleResponse, checked: boolean): void {
    this.update(module.permissions.map((item) => item.code), checked);
  }

  protected toggleExpanded(): void {
    const open = !this.expanded();
    this.expanded.set(open);
    if (open) {
      afterNextRender(() => this.filterInput()?.nativeElement.focus(), { injector: this.injector });
    }
  }

  private update(codes: string[], checked: boolean): void {
    const next = new Set(this.selected());
    for (const code of codes) {
      if (!isPermission(code)) continue;
      if (checked) next.add(code); else next.delete(code);
    }
    this.selected.set(next);
  }
}
