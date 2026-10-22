import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth';
import { daysLeft, date, duration, levelRange, rub } from '../../core/format';
import {
  IMPACT_NAMES,
  LIKELIHOOD_NAMES,
  MeasureAction,
  MeasureStatus,
  RESPONSE_MODE_NAMES,
  RiskDetails,
  levelOf,
} from '../../core/models';
import {
  Gate,
  approvalLevel,
  approverOf,
  canAccept,
  canAssess,
  canClose,
  canEditMeasure,
  canEditRisk,
  canComment,
  canReopen,
  canCreateMeasure,
  canTreat,
  ACTIONS_BY_STATUS,
  MEASURE_ACTION_NAMES,
  canMeasure,
  endsCycle,
  executorsFor,
} from '../../core/risk-rules';
import { MeasureActions } from '../measures/measure-actions';
import { RisksApi } from '../../core/risks-api';
import { Heatmap } from '../../ui/heatmap';
import { Icon } from '../../ui/icon';
import { MeasureStatusChip } from '../../ui/measure-status';
import { PageHeader } from '../../ui/page-header';
import { RiskScore } from '../../ui/risk-score';
import { RiskStatusChip } from '../../ui/risk-status';
import { AssessDialog } from './assess-dialog';
import { CloseDialog } from './close-dialog';
import { MeasureDialog } from './measure-dialog';
import { RiskCreate } from '../risks/risk-create';

type Tab = 'measures' | 'history' | 'comments';

const DEFAULT_THRESHOLDS = { owner: 10, director: 15, ceo: 19 };
const DENIED: Gate = { ok: false, why: '' };

const MEASURE_ORDER: MeasureStatus[] = [
  'APPROVAL',
  'APPROVED',
  'PENDING',
  'IN_PROGRESS',
  'HOLD',
  'DRAFT',
  'DONE',
  'CANCELLED',
];

@Component({
  selector: 'app-risk-card',
  imports: [
    PageHeader,
    Icon,
    RiskStatusChip,
    MeasureStatusChip,
    RiskScore,
    Heatmap,
    RouterLink,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
  ],
  templateUrl: './risk-card.html',
  styleUrl: './risk-card.scss',
})
export class RiskCard {
  private readonly api = inject(RisksApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);

  /** Bound from the `risks/:id` route. */
  readonly id = input.required<string>();

  protected readonly resource = httpResource<RiskDetails>(() => `${API}/risks/${this.id()}`);
  /** Server response, replaced by the card an action returns. */
  protected readonly risk = linkedSignal(() =>
    this.resource.hasValue() ? this.resource.value() : undefined,
  );

  protected readonly dict = this.api.dictionaries;
  protected readonly thresholds = computed(
    () => this.dict.value()?.thresholds ?? DEFAULT_THRESHOLDS,
  );

  // Helpers for the template.
  protected readonly rub = rub;
  protected readonly date = date;
  protected readonly duration = duration;
  protected readonly likelihoodNames = LIKELIHOOD_NAMES;
  protected readonly impactNames = IMPACT_NAMES;
  protected readonly modeNames = RESPONSE_MODE_NAMES;

  private gate(check: (r: RiskDetails) => Gate): Gate {
    const r = this.risk(),
      u = this.auth.user(),
      d = this.dict.value();
    return r && u && d ? check(r) : DENIED;
  }
  protected readonly assessGate = computed(() =>
    this.gate((r) => canAssess(r, this.auth.user()!, this.dict.value()!)),
  );
  protected readonly acceptGate = computed(() =>
    this.gate((r) => canAccept(r, this.auth.user()!, this.dict.value()!)),
  );
  protected readonly treatGate = computed(() =>
    this.gate((r) => canTreat(r, this.auth.user()!, this.dict.value()!)),
  );
  protected readonly measureGate = computed(() =>
    this.gate((r) => canCreateMeasure(r, this.auth.user()!)),
  );
  protected readonly commentGate = computed(() => this.gate(() => canComment(this.auth.user()!)));
  protected readonly closeGate = computed(() =>
    this.gate((r) => canClose(r, this.auth.user()!, this.dict.value()!)),
  );
  protected readonly editGate = computed(() =>
    this.gate((r) => canEditRisk(r, this.auth.user()!, this.dict.value()!)),
  );
  protected readonly reopenGate = computed(() =>
    this.gate((r) => canReopen(r, this.auth.user()!, this.dict.value()!)),
  );

  /** Current assessment, or the previous one while the risk waits for reassessment. */
  protected readonly shown = computed(() => {
    const r = this.risk();
    return r?.assessment ?? r?.previous ?? null;
  });
  protected readonly level = computed(() => {
    const a = this.shown();
    return a ? levelOf(a.score, this.thresholds()) : null;
  });
  protected readonly levelText = computed(() => {
    const lv = this.level();
    return lv ? `${lv} · ${levelRange(lv, this.thresholds())}` : '';
  });

  protected readonly severity = computed(() => {
    const t = this.dict.value()?.impactThresholds;
    if (!t) return [];
    const impact = this.shown()?.impact ?? -1;
    return [
      { name: '0–2', range: `ниже ${rub(t[2])}`, on: impact >= 0 && impact <= 2, fill: 0.12 },
      { name: '3 · Средняя', range: `от ${rub(t[2])}`, on: impact === 3, fill: 0.22 },
      { name: '4 · Высокая', range: `от ${rub(t[3])}`, on: impact === 4, fill: 0.32 },
      { name: '5 · Критическая', range: `от ${rub(t[4])}`, on: impact === 5, fill: 0.42 },
    ];
  });
  protected readonly severityNote = computed(() => {
    const a = this.shown(),
      t = this.dict.value()?.impactThresholds;
    if (!a || !t) return '';
    return a.impact === 0
      ? `${rub(a.lossAmount)} ниже порога уровня 1 (${rub(t[0])}).`
      : `${rub(a.lossAmount)} ≥ ${rub(t[a.impact - 1])}, это порог уровня ${a.impact}.`;
  });

  protected readonly tab = signal<Tab>('measures');

  protected readonly measures = computed(() =>
    [...(this.risk()?.measures ?? [])].sort(
      (a, b) => MEASURE_ORDER.indexOf(a.status) - MEASURE_ORDER.indexOf(b.status),
    ),
  );
  protected readonly progress = computed(() => {
    const all = this.risk()?.measures ?? [];
    const live = all.filter((m) => m.status !== 'CANCELLED');
    const done = live.filter((m) => m.status === 'DONE');
    const pct = live.length ? (done.length / live.length) * 100 : 0;
    const legend = MEASURE_ORDER.map((s) => ({
      s,
      n: all.filter((m) => m.status === s).length,
    })).filter((x) => x.n);
    return {
      done: done.length,
      live: live.length,
      pct,
      plan: live.reduce((a, m) => a + m.costPlanned, 0),
      fact: done.reduce((a, m) => a + (m.costActual ?? 0), 0),
      legend,
    };
  });

  protected measureStrip(m: RiskDetails['measures'][number]): {
    level: string;
    text: string;
    sub: string;
    tone: string;
  } {
    const d = this.dict.value();
    if (!d) return { level: '', text: '', sub: '', tone: '' };
    const lv = approvalLevel(m.costPlanned, d.approval);
    const who = approverOf(lv, m.process, d);
    switch (m.status) {
      case 'DRAFT':
        return {
          level: lv,
          text: `При отправке согласует: ${who}`,
          sub: 'Ещё не отправлена на согласование',
          tone: '',
        };
      case 'APPROVAL':
        return {
          level: lv,
          text: `Согласующий: ${who}`,
          sub: `отправлено ${date(m.sentAt)}`,
          tone: '',
        };
      case 'APPROVED':
        return {
          level: lv,
          text: `Согласовано ${date(m.decidedAt)}`,
          sub: 'К выполнению передаёт владелец процесса',
          tone: '',
        };
      case 'PENDING':
        return {
          level: '',
          text: `Исполнитель: ${m.executor}`,
          sub: 'Ждёт начала работ',
          tone: '',
        };
      case 'IN_PROGRESS':
        return {
          level: '',
          text: `Исполнитель: ${m.executor}`,
          sub: `Согласовано ${date(m.decidedAt)} · ${lv}`,
          tone: '',
        };
      case 'HOLD':
        return {
          level: '',
          text: `Исполнитель: ${m.executor}`,
          sub: 'Выполнение приостановлено',
          tone: '',
        };
      case 'DONE': {
        const diff = m.costPlanned - (m.costActual ?? 0);
        return {
          level: '',
          text: diff >= 0 ? `Экономия ${rub(diff)} к плану` : `Перерасход ${rub(-diff)} к плану`,
          sub: `Исполнитель: ${m.executor} · завершена ${date(m.doneAt)}`,
          tone: diff >= 0 ? 'good' : 'warn',
        };
      }
      case 'CANCELLED':
        return {
          level: '',
          text: 'Мера отменена',
          sub: 'Не блокирует принятие и закрытие риска',
          tone: '',
        };
    }
  }

  private readonly measureActions = inject(MeasureActions);

  protected measureById(id: string): RiskDetails['measures'][number] {
    return this.risk()!.measures.find((x) => x.id === id)!;
  }

  /** Menu of a measure: every action of its status, disabled ones with the reason. */
  protected measureMenu(m: RiskDetails['measures'][number]) {
    const r = this.risk(),
      u = this.auth.user(),
      d = this.dict.value();
    if (!r || !u || !d) return [];
    return ACTIONS_BY_STATUS[m.status].map((action) => ({
      action,
      label: MEASURE_ACTION_NAMES[action],
      gate: canMeasure(action, m, r, u, d),
      ends: endsCycle(action, m, r),
    }));
  }

  protected editMeasureGate(m: RiskDetails['measures'][number]): Gate {
    return this.gate(() => canEditMeasure(m, this.auth.user()!, this.dict.value()!));
  }

  protected async runMeasure(
    m: RiskDetails['measures'][number],
    item: { action: MeasureAction; ends: boolean },
  ): Promise<void> {
    const r = this.risk()!,
      d = this.dict.value()!;
    this.notice.set(null);
    try {
      const updated = await this.measureActions.run({
        measure: m,
        action: item.action,
        executors: executorsFor(m, d),
        directorate: d.processes.find((p) => p.name === m.process)?.directorate ?? '',
        ends: item.ends,
        draftsLeft: r.measures.some((x) => x.id !== m.id && x.status === 'DRAFT'),
      });
      if (!updated) return;
      this.risk.set(updated);
      this.notice.set({ text: updated.history[0]?.text ?? 'Готово.', error: false });
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
    }
  }

  protected dueText(m: RiskDetails['measures'][number]): string {
    if (m.status === 'DONE' || m.status === 'CANCELLED') return date(m.dueDate);
    const n = daysLeft(m.dueDate);
    return `${date(m.dueDate)} · ${n >= 0 ? `через ${n} дн.` : `просрочено на ${-n} дн.`}`;
  }

  // Actions.
  protected readonly busy = signal(false);
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);
  protected readonly draft = signal('');

  private async run(action: () => Promise<RiskDetails>, done: string): Promise<boolean> {
    this.busy.set(true);
    this.notice.set(null);
    try {
      this.risk.set(await action());
      this.notice.set({ text: done, error: false });
      return true;
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected accept(): void {
    const r = this.risk()!;
    this.run(() => this.api.chooseMode(r.id, 'accept'), `Риск принят на уровне ${this.level()}.`);
  }

  protected reopen(): void {
    const r = this.risk()!;
    this.run(
      () => this.api.reopen(r.id),
      'Риск возвращён из архива. Нужна новая оценка владельца процесса.',
    );
  }

  protected openClose(): void {
    this.dialog
      .open<RiskDetails>(CloseDialog, {
        data: this.risk(),
        width: '560px',
        maxWidth: 'calc(100vw - 32px)',
        backdropClass: 'dialog-backdrop',
        ariaLabelledBy: 'cl-title',
      })
      .closed.subscribe((updated) => {
        if (!updated) return;
        this.risk.set(updated);
        this.notice.set({ text: 'Риск закрыт и перенесён в архив.', error: false });
      });
  }

  protected treat(): void {
    const r = this.risk()!;
    this.run(
      () => this.api.chooseMode(r.id, 'treat'),
      'Выбран режим «Обработать». Теперь можно добавлять меры.',
    );
  }

  protected async sendComment(): Promise<void> {
    const r = this.risk()!;
    if (await this.run(() => this.api.comment(r.id, this.draft()), 'Комментарий добавлен.'))
      this.draft.set('');
  }

  protected openAssess(): void {
    const r = this.risk()!;
    this.dialog
      .open<RiskDetails>(AssessDialog, {
        data: { risk: r, dict: this.dict.value() },
        width: '720px',
        maxWidth: 'calc(100vw - 32px)',
        backdropClass: 'dialog-backdrop',
        ariaLabelledBy: 'as-title',
      })
      .closed.subscribe((updated) => {
        if (!updated) return;
        this.risk.set(updated);
        this.notice.set({ text: 'Оценка сохранена, риск в статусе «Активен».', error: false });
      });
  }

  protected openEdit(): void {
    this.dialog
      .open<RiskDetails>(RiskCreate, {
        data: this.risk(),
        width: '640px',
        maxWidth: 'calc(100vw - 32px)',
        panelClass: 'dialog-pane',
        backdropClass: 'dialog-backdrop',
        ariaLabelledBy: 'nr-title',
      })
      .closed.subscribe((updated) => {
        if (!updated) return;
        this.risk.set(updated);
        this.notice.set({ text: 'Паспорт черновика сохранён.', error: false });
      });
  }

  protected openEditMeasure(m: RiskDetails['measures'][number]): void {
    this.dialog
      .open<RiskDetails>(MeasureDialog, {
        data: { risk: this.risk(), dict: this.dict.value(), measure: m },
        width: '760px',
        maxWidth: 'calc(100vw - 32px)',
        backdropClass: 'dialog-backdrop',
        ariaLabelledBy: 'nm-title',
      })
      .closed.subscribe((updated) => {
        if (!updated) return;
        this.risk.set(updated);
        this.notice.set({ text: `Мера ${m.id} сохранена.`, error: false });
      });
  }

  protected openMeasure(): void {
    const r = this.risk()!;
    this.dialog
      .open<RiskDetails>(MeasureDialog, {
        data: { risk: r, dict: this.dict.value() },
        width: '760px',
        maxWidth: 'calc(100vw - 32px)',
        backdropClass: 'dialog-backdrop',
        ariaLabelledBy: 'nm-title',
      })
      .closed.subscribe((updated) => {
        if (!updated) return;
        this.risk.set(updated);
        this.tab.set('measures');
        this.notice.set({
          text: `Мера ${updated.measures[0].id} создана в статусе «Черновик».`,
          error: false,
        });
      });
  }
}
