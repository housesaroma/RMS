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
  | 'arrow-right';

/** Decorative stroke icon from public/icons.svg; label the parent control instead. */
@Component({
  selector: 'ui-icon',
  template: `<svg aria-hidden="true" [attr.width]="size()" [attr.height]="size()">
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
