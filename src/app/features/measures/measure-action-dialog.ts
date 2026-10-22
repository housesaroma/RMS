import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { errorMessage } from '../../core/api';
import { rub } from '../../core/format';
import { Measure, MeasureAction, RiskDetails } from '../../core/models';
import { MEASURE_ACTION_NAMES } from '../../core/risk-rules';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';

export interface MeasureActionData {
  measure: Pick<Measure, 'id' | 'title' | 'costPlanned' | 'costActual' | 'process'>;
  action: MeasureAction;
  executors: string[];
  directorate: string;
  /** The action closes the last active measure: the risk goes to reassessment. */
  ends: boolean;
  draftsLeft: boolean;
}

/** Collects what an action needs (reason, executor, actual cost) and confirms cycle completion. */
@Component({
  selector: 'app-measure-action-dialog',
  imports: [Icon],
  templateUrl: './measure-action-dialog.html',
  styleUrl: '../risk-card/dialog.scss',
})
export class MeasureActionDialog {
  private readonly ref = inject<DialogRef<RiskDetails>>(DialogRef);
  private readonly api = inject(RisksApi);
  protected readonly data = inject<MeasureActionData>(DIALOG_DATA);

  protected readonly title = MEASURE_ACTION_NAMES[this.data.action];
  protected readonly rub = rub;
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly reason = signal('');
  protected readonly executor = signal(this.data.executors[0] ?? '');
  protected readonly cost = signal(
    this.data.measure.costActual != null
      ? this.data.measure.costActual.toLocaleString('ru-RU')
      : '',
  );
  private readonly costValue = computed(() => {
    const raw = this.cost().replace(/\s/g, '');
    return /^\d+$/.test(raw) ? Number(raw) : null;
  });

  protected readonly valid = computed(() => {
    switch (this.data.action) {
      case 'reject':
      case 'revoke':
        return !!this.reason().trim();
      case 'handover':
        return !!this.executor();
      case 'finish':
        return this.costValue() != null;
      default:
        return true;
    }
  });

  protected formatCost(raw: string): void {
    const digits = raw.replace(/\D/g, '').slice(0, 12);
    this.cost.set(digits ? Number(digits).toLocaleString('ru-RU') : '');
  }

  protected async submit(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.ref.close(
        await this.api.measureAction(this.data.measure.id, {
          action: this.data.action,
          reason: this.reason().trim() || undefined,
          executor: this.data.action === 'handover' ? this.executor() : undefined,
          costActual: this.data.action === 'finish' ? this.costValue()! : undefined,
        }),
      );
    } catch (err) {
      this.error.set(errorMessage(err));
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
