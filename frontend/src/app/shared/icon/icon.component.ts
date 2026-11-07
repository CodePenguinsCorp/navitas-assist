import { Component, computed, input } from '@angular/core';

/** Stroke icons on a 24px grid (2px stroke, round caps), drawn for this app. */
const ICONS = {
  dashboard: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M13 10h7v10h-7z', 'M4 13h7v7H4z'],
  clipboard: ['M9 4h6v3H9z', 'M8 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H16', 'M9 12h6', 'M9 16h4'],
  columns: ['M4 4h4.5v16H4z', 'M10 4h4.5v11H10z', 'M16 4h4v7h-4z'],
  bell: ['M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z', 'M10 20a2.2 2.2 0 0 0 4 0'],
  wrench: ['M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5', 'M14.5 6.5 17 4l3 3-2.5 2.5'],
  building: ['M5 21V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V21', 'M15 10h3.5a1.5 1.5 0 0 1 1.5 1.5V21', 'M3 21h18', 'M8.5 8h3', 'M8.5 12h3', 'M8.5 16h3'],
  box: ['M12 3 20 7.5v9L12 21l-8-4.5v-9z', 'M4 7.5 12 12l8-4.5', 'M12 12v9'],
  checklist: ['M10 6h10', 'M10 12h10', 'M10 18h10', 'm3.5 6 1.5 1.5L7.5 5', 'm3.5 12 1.5 1.5L7.5 11', 'm3.5 18 1.5 1.5L7.5 17'],
  users: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20c.8-3.4 3.3-5.2 6.5-5.2s5.7 1.8 6.5 5.2', 'M16 4.3a3.5 3.5 0 0 1 0 6.4', 'M18 14.9c1.8.6 3 2.3 3.5 5.1'],
  chart: ['M4 20h16', 'M7 16v-4', 'M12 16V7', 'M17 16v-7'],
  plus: ['M12 5v14', 'M5 12h14'],
  pencil: ['M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z', 'm13.5 6.5 3 3'],
  trash: ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6.5 7l1 13h9l1-13', 'M10 11v5', 'M14 11v5'],
  history: ['M3.5 12a8.5 8.5 0 1 0 2.5-6', 'M3.5 4v4h4', 'M12 8v4l3 2'],
  move: ['M7 7h13', 'm16 3 4 4-4 4', 'M17 17H4', 'm8 13-4 4 4 4'],
  logout: ['M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10', 'M15 8l4 4-4 4', 'M19 12H9'],
  chevron: ['m9 6 6 6-6 6'],
  alert: ['M12 4 21 20H3z', 'M12 10v4', 'M12 17h.01'],
  check: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'm8 12 3 3 5-6'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  shield: ['M12 3 19 6v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z', 'm9 12 2 2 4-4'],
  inbox: ['M3 13h5l1.5 3h5L16 13h5', 'M5.5 5h13L21 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V13z'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 20c1-3.6 3.9-5.5 7.5-5.5s6.5 1.9 7.5 5.5'],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  layers: ['m12 3 9 5-9 5-9-5z', 'm3 13 9 5 9-5']
} as const;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: [':host { display: inline-flex; flex-shrink: 0; line-height: 0; }']
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(18);
  protected readonly paths = computed(() => ICONS[this.name()]);
}
