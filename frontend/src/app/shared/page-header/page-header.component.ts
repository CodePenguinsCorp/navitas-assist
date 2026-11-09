import { Component, input } from '@angular/core';

/**
 * Collection page heading: title and projected actions.
 * The input is named "heading" because "title" would also become the host's native tooltip.
 */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="page-heading">
      <div class="page-heading__title">
        <h1>{{ heading() }}</h1>
      </div>
      <div class="shell-actions"><ng-content /></div>
    </header>
  `,
  styles: [':host { display: block; }']
})
export class PageHeaderComponent {
  readonly heading = input.required<string>();
}
