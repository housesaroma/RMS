import { Component, input } from '@angular/core';
import { PageHeader } from '../ui/page-header';

/** Section that is not built yet: real header, empty body. Replaced screen by screen. */
@Component({
  selector: 'app-placeholder',
  imports: [PageHeader],
  template: `
    <ui-page-header [title]="heading()" [crumbs]="crumbs()" />
    <section class="card empty">
      <p>Раздел «{{ heading() }}» появится в следующих итерациях.</p>
    </section>
  `,
  styles: `
    :host {
      display: contents;
    }
    .empty {
      padding: 48px 28px;
      text-align: center;
      color: var(--muted);
      font-size: var(--fs-lg);
    }
    p {
      margin: 0;
    }
  `,
})
export class Placeholder {
  readonly heading = input.required<string>();
  readonly crumbs = input<string[]>([]);
}
