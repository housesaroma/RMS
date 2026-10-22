import { Component, input } from '@angular/core';
import { RISK_STATUS_NAMES, RiskStatus } from '../core/models';

@Component({
  selector: 'ui-risk-status',
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
      background: var(--rs-draft-bg);
      color: var(--rs-draft-fg);
    }
    [data-status='ACTIVE'] {
      background: var(--rs-active-bg);
      color: var(--rs-active-fg);
    }
    [data-status='REASSESSMENT'] {
      background: var(--rs-review-bg);
      color: var(--rs-review-fg);
    }
    [data-status='ACCEPTED'] {
      background: var(--rs-accepted-bg);
      color: var(--rs-accepted-fg);
    }
    [data-status='CLOSED'] {
      background: var(--rs-closed-bg);
      color: var(--rs-closed-fg);
      border-color: var(--rs-closed-border);
    }
  `,
})
export class RiskStatusChip {
  readonly status = input.required<RiskStatus>();
  protected readonly names = RISK_STATUS_NAMES;
}
