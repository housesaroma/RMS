import { Component, computed, input } from '@angular/core';
import { Level, RiskStatus, Thresholds, levelOf } from '../core/models';

const LEVEL_VAR: Record<Level, string> = {
  OWNER: 'owner',
  DIRECTOR: 'director',
  CEO: 'ceo',
  TREATMENT_REQUIRED: 'treatment',
};

/** R = L × I badge with the acceptance level; "—" when there is no current assessment. */
@Component({
  selector: 'ui-risk-score',
  template: `
    <span class="line">
      <span class="badge" [style]="badgeStyle()">{{ score() || '—' }}</span>
      <span class="sub">{{ score() ? likelihood() + '×' + impact() : emptyText() }}</span>
    </span>
    @if (level(); as lv) {
      <span class="level" [style.color]="'var(--lv-' + vars[lv] + '-text)'">{{ lv }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-direction: column;
      gap: 3px;
    }
    .line {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      height: 26px;
      padding: 0 8px;
      border-radius: 9px;
      font-size: var(--fs-sm);
      font-weight: 600;
      background: var(--chip-bg);
      color: var(--chip-fg);
    }
    .sub {
      font-size: var(--fs-xs);
      line-height: 1.25;
      color: var(--muted);
    }
    .level {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
  `,
})
export class RiskScore {
  readonly likelihood = input<number | null>(null);
  readonly impact = input<number | null>(null);
  readonly status = input.required<RiskStatus>();
  readonly thresholds = input.required<Thresholds>();

  protected readonly vars = LEVEL_VAR;
  protected readonly score = computed(() => (this.likelihood() ?? 0) * (this.impact() ?? 0));
  protected readonly level = computed(() =>
    this.score() ? levelOf(this.score(), this.thresholds()) : null,
  );
  protected readonly badgeStyle = computed(() => {
    const lv = this.level();
    return lv ? `background: var(--lv-${LEVEL_VAR[lv]}); color: var(--lv-${LEVEL_VAR[lv]}-on)` : '';
  });
  protected readonly emptyText = computed(() =>
    this.status() === 'DRAFT' ? 'без оценки' : 'нет текущей оценки',
  );
}
