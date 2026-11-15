import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { TipDirective } from '../tip/tip.directive';

/**
 * Collection page heading: title and projected actions. A sub-page (not in the menu) passes
 * backLink and backLabel to get the back arrow before the title, in place of a page-level Cancel.
 * The input is named "heading" because "title" would also become the host's native tooltip.
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, IconComponent, TipDirective],
  template: `
    <header class="page-heading">
      <div class="page-heading__title">
        @if (backLink(); as link) {
          <a class="icon-button page-heading__back" [routerLink]="link" [attr.aria-label]="backLabel()" [appTip]="backLabel()" tipPosition="bottom"><app-icon name="arrow-left" [size]="20" /></a>
        }
        <h1>{{ heading() }}</h1>
      </div>
      <div class="shell-actions"><ng-content /></div>
    </header>
  `,
  styles: [':host { display: block; }']
})
export class PageHeaderComponent {
  readonly heading = input.required<string>();
  /** Route of the origin list; shows the back arrow when set. */
  readonly backLink = input<string | null>(null);
  readonly backLabel = input('Voltar');
}
