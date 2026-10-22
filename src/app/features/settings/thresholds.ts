import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { AdminApi } from '../../core/admin-api';
import { errorMessage } from '../../core/api';
import { date, rub } from '../../core/format';
import { RisksApi } from '../../core/risks-api';
import { approvalLevel } from '../../core/risk-rules';
import { Heatmap } from '../../ui/heatmap';
import { Icon } from '../../ui/icon';
import { PageHeader } from '../../ui/page-header';
import { SettingsTabs, noteOf } from './settings-tabs';

const num = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));

@Component({
  selector: 'app-settings-thresholds',
  imports: [PageHeader, SettingsTabs, Icon, Heatmap],
  templateUrl: './thresholds.html',
  styleUrl: './settings.scss',
  styles: `
    .inputs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .check-measure {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px;
      border-radius: 18px;
      background: color-mix(in srgb, var(--lv-h, var(--muted)) 12%, var(--inner-bg));
    }
  `,
})
export class Thresholds {
  private readonly api = inject(AdminApi);
  protected readonly dict = inject(RisksApi).dictionaries;
  protected readonly note = noteOf('thresholds');
  protected readonly changes = this.api.changes();
  protected readonly date = date;
  protected readonly rub = rub;
  protected readonly keys = ['owner', 'director', 'ceo'] as const;

  protected readonly acc = linkedSignal(() => {
    const t = this.dict.value()?.thresholds;
    return t
      ? { owner: String(t.owner), director: String(t.director), ceo: String(t.ceo) }
      : { owner: '', director: '', ceo: '' };
  });
  protected readonly appr = linkedSignal(() => {
    const t = this.dict.value()?.approval;
    return t
      ? { owner: String(t.owner), director: String(t.director), ceo: String(t.ceo) }
      : { owner: '', director: '', ceo: '' };
  });

  protected readonly accValue = computed(() => ({
    owner: num(this.acc().owner),
    director: num(this.acc().director),
    ceo: num(this.acc().ceo),
  }));
  protected readonly apprValue = computed(() => ({
    owner: num(this.appr().owner),
    director: num(this.appr().director),
    ceo: num(this.appr().ceo),
  }));

  protected readonly accError = computed(() => {
    const t = this.accValue();
    if (Object.values(t).some((x) => !Number.isInteger(x))) return 'Пороги — целые значения R';
    return 0 <= t.owner && t.owner < t.director && t.director < t.ceo && t.ceo < 25
      ? ''
      : 'Нужно 0 ≤ OWNER < DIRECTOR < CEO < 25';
  });
  protected readonly apprError = computed(() => {
    const t = this.apprValue();
    if (Object.values(t).some((x) => !Number.isFinite(x))) return 'Пороги — суммы в рублях';
    return 0 <= t.owner && t.owner < t.director && t.director < t.ceo
      ? ''
      : 'Нужно 0 ≤ OWNER < DIRECTOR < CEO';
  });

  protected readonly dirty = computed(() => {
    const d = this.dict.value();
    return (
      !!d &&
      (JSON.stringify(this.accValue()) !== JSON.stringify(d.thresholds) ||
        JSON.stringify(this.apprValue()) !== JSON.stringify(d.approval))
    );
  });

  protected readonly cost = signal('64 000');
  protected readonly costLevel = computed(() => {
    const c = num(this.cost());
    return Number.isFinite(c) && !this.apprError() ? approvalLevel(c, this.apprValue()) : null;
  });

  protected readonly applyToActive = signal(true);
  protected readonly busy = signal(false);
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);

  protected setAcc(k: 'owner' | 'director' | 'ceo', v: string): void {
    this.acc.update((x) => ({ ...x, [k]: v }));
  }
  protected setAppr(k: 'owner' | 'director' | 'ceo', v: string): void {
    this.appr.update((x) => ({ ...x, [k]: v }));
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.updateDictionaries({
        thresholds: this.accValue(),
        approval: this.apprValue(),
        recalc: this.applyToActive(),
      });
      this.notice.set({
        text: this.applyToActive()
          ? 'Пороги сохранены. Уровни принятия активных рисков пересчитаны.'
          : 'Пороги сохранены и действуют для новых оценок и запросов.',
        error: false,
      });
      this.changes.reload();
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
    } finally {
      this.busy.set(false);
    }
  }
}
