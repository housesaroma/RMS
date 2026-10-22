import { Component, input } from '@angular/core';
import { MEASURE_STATUS_NAMES, MeasureStatus } from '../core/models';

@Component({
  selector: 'ui-measure-status',
  template: `<span class="chip" [attr.data-status]="status()">{{ names[status()] }}</span>`,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 26px;
      padding: 0 11px;
      border-radius: var(--r-pill);
      font-size: var(--fs-xs);
      font-weight: 500;
      white-space: nowrap;
      border: 1px solid transparent;

      &::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
    }
    [data-status='DRAFT'] {
      background: var(--ms-draft-bg);
      color: var(--ms-draft-fg);
    }
    [data-status='APPROVAL'] {
      background: var(--ms-approval-bg);
      color: var(--ms-approval-fg);
    }
    [data-status='APPROVED'] {
      background: var(--ms-approved-bg);
      color: var(--ms-approved-fg);
    }
    [data-status='PENDING'] {
      background: var(--ms-pending-bg);
      color: var(--ms-pending-fg);
    }
    [data-status='IN_PROGRESS'] {
      background: var(--ms-progress-bg);
      color: var(--ms-progress-fg);
    }
    [data-status='HOLD'] {
      background: var(--ms-hold-bg);
      color: var(--ms-hold-fg);
      border: 1px dashed var(--ms-hold-border);
    }
    [data-status='DONE'] {
      background: var(--ms-done-bg);
      color: var(--ms-done-fg);
    }
    [data-status='CANCELLED'] {
      background: var(--ms-cancelled-bg);
      color: var(--ms-cancelled-fg);
    }
  `,
})
export class MeasureStatusChip {
  readonly status = input.required<MeasureStatus>();
  protected readonly names = MEASURE_STATUS_NAMES;
}
