import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, min, validate } from '@angular/forms/signals';
import { errorMessage } from '../../core/api';
import { date, duration, levelRange, rub } from '../../core/format';
import {
  Dictionaries,
  IMPACT_NAMES,
  LIKELIHOOD_NAMES,
  RiskDetails,
  levelOf,
} from '../../core/models';
import { impactOf, lossOf } from '../../core/risk-rules';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';

/** UC-2-04 primary assessment and reassessment (analytics 09, §6.4). */
@Component({
  selector: 'app-assess-dialog',
  imports: [FormField, FormRoot, Icon],
  templateUrl: './assess-dialog.html',
  styleUrl: './dialog.scss',
})
export class AssessDialog {
  private readonly ref = inject<DialogRef<RiskDetails>>(DialogRef);
  private readonly api = inject(RisksApi);
  private readonly data = inject<{ risk: RiskDetails; dict: Dictionaries }>(DIALOG_DATA);

  protected readonly risk = this.data.risk;
  protected readonly dict = this.data.dict;
  protected readonly cost =
    this.dict.assets.find((a) => a.name === this.risk.asset)?.hourlyDowntimeCost ?? null;
  protected readonly first = this.risk.status === 'DRAFT';

  protected readonly likelihoodNames = LIKELIHOOD_NAMES;
  protected readonly impactNames = IMPACT_NAMES;
  protected readonly rub = rub;
  protected readonly date = date;
  protected readonly duration = duration;
  protected readonly error = signal('');

  protected readonly model = signal({ likelihood: -1, lossAmount: 0, weeks: 0, days: 0, hours: 0 });
  protected readonly f = form(
    this.model,
    (p) => {
      validate(p.likelihood, ({ value }) =>
        value() < 0 ? { kind: 'required', message: 'Выберите вероятность' } : undefined,
      );
      for (const field of [p.lossAmount, p.weeks, p.days, p.hours])
        min(field, 0, { message: 'Не меньше 0' });
      for (const field of [p.weeks, p.days])
        validate(field, ({ value }) =>
          Number.isInteger(value()) ? undefined : { kind: 'integer', message: 'Целое число' },
        );
    },
    {
      submission: {
        onInvalid: (f) => f().markAsTouched(),
        action: async () => {
          this.error.set('');
          const m = this.model();
          const input = this.cost
            ? { likelihood: m.likelihood, weeks: m.weeks, days: m.days, hours: m.hours }
            : { likelihood: m.likelihood, lossAmount: m.lossAmount };
          try {
            this.ref.close(await this.api.assess(this.risk.id, input));
          } catch (e) {
            this.error.set(errorMessage(e, 'Не удалось сохранить оценку. Повторите попытку.'));
          }
          return undefined;
        },
      },
    },
  );

  /** Live preview with the same rules the server applies. */
  protected readonly preview = computed(() => {
    const m = this.model();
    const { hours, loss } = lossOf(m, this.cost);
    const impact = impactOf(loss, this.dict.impactThresholds);
    const l = Math.max(m.likelihood, 0);
    const score = l * impact;
    const level = levelOf(score, this.dict.thresholds);
    return { hours, loss, impact, score, level, range: levelRange(level, this.dict.thresholds) };
  });

  protected pick(l: number): void {
    this.f.likelihood().value.set(l);
    this.f.likelihood().markAsTouched();
  }

  protected close(): void {
    this.ref.close();
  }
}
