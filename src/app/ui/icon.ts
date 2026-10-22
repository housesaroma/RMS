import { Component, input } from '@angular/core';

export type IconName =
  | 'shield'
  | 'grid'
  | 'alert'
  | 'archive'
  | 'sliders'
  | 'moon'
  | 'home'
  | 'search'
  | 'logout'
  | 'eye'
  | 'eye-off'
  | 'info'
  | 'error'
  | 'arrow-right'
  | 'download'
  | 'plus'
  | 'close'
  | 'calendar'
  | 'chevron-left'
  | 'chevron-right'
  | 'sort'
  | 'sort-asc'
  | 'sort-desc'
  | 'more'
  | 'fire'
  | 'lock'
  | 'gauge';

/** Decorative stroke icon from public/icons.svg; label the parent control instead. */
@Component({
  selector: 'ui-icon',
  // Paint attributes live here: <use> of an external sprite does not inherit them from its root.
  template: `<svg
    aria-hidden="true"
    [attr.width]="size()"
    [attr.height]="size()"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <use [attr.href]="'icons.svg#' + name()" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
}
