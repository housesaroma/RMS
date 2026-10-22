import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { AdminApi } from '../../core/admin-api';
import { errorMessage } from '../../core/api';
import { rub } from '../../core/format';
import { IMPACT_NAMES, LIKELIHOOD_NAMES } from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { Heatmap } from '../../ui/heatmap';
import { Icon } from '../../ui/icon';
import { PageHeader } from '../../ui/page-header';
import { SettingsTabs, noteOf } from './settings-tabs';

@Component({
  selector: 'app-settings-method',
  imports: [PageHeader, SettingsTabs, Icon, Heatmap],
  templateUrl: './method.html',
  styleUrl: './settings.scss',
  styles: `
    .scale {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
    }
    .lvl {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px;
      border-radius: 16px;
      background: var(--inner-bg);
    }
    .lvl b {
      font-size: 28px;
      font-weight: 200;
    }
    .money-row {
      display: grid;
      grid-template-columns: 160px 200px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
    }
    @media (max-width: 760px) {
      .scale {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .money-row {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class Method {
  private readonly api = inject(AdminApi);
  protected readonly dict = inject(RisksApi).dictionaries;
  protected readonly note = noteOf('method');
  protected readonly likelihood = LIKELIHOOD_NAMES;
  protected readonly impact = IMPACT_NAMES;
  protected readonly rub = rub;

  /** Lower bounds of impact levels 1–5 as typed. */
  protected readonly draft = linkedSignal(() =>
    (this.dict.value()?.impactThresholds ?? [0, 0, 0, 0, 0]).map(String),
  );
  protected readonly confirm = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);

  protected readonly values = computed(() =>
    this.draft().map((v) => Number(v.replace(/\s/g, '').replace(',', '.'))),
  );
  protected readonly error = computed(() => {
    const v = this.values();
    if (v.some((x) => !Number.isFinite(x) || x < 0))
      return 'Пороги — неотрицательные суммы в рублях';
    if (v.some((x, k) => k > 0 && x <= v[k - 1]))
      return 'Пороги должны строго возрастать от уровня 1 к уровню 5';
    return '';
  });
  protected readonly dirty = computed(
    () => JSON.stringify(this.values()) !== JSON.stringify(this.dict.value()?.impactThresholds),
  );

  /** Level ranges: level 0 starts at 0, each upper bound is the next lower bound minus a kopeck. */
  protected readonly ranges = computed(() => {
    const v = this.values();
    return [0, 1, 2, 3, 4, 5].map((k) => {
      const from = k === 0 ? 0 : v[k - 1];
      const to = k === 5 ? null : v[k] - 0.01;
      return {
        k,
        text:
          to == null
            ? `от ${rub(from)}`
            : to < from
              ? 'пустой диапазон'
              : `${rub(from)} — ${rub(to)}`,
      };
    });
  });

  protected set(k: number, value: string): void {
    this.draft.update((d) => d.map((x, i) => (i === k ? value : x)));
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.updateDictionaries({
        impactThresholds: this.values() as [number, number, number, number, number],
        recalc: true,
      });
      this.confirm.set(false);
      this.notice.set({
        text: 'Пороги сохранены, текущие оценки активных рисков пересчитаны техническими версиями.',
        error: false,
      });
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
    } finally {
      this.busy.set(false);
    }
  }
}
