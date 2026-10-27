import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth';
import { date, levelRange, rub } from '../../core/format';
import {
  DashboardData,
  IMPACT_NAMES,
  LIKELIHOOD_NAMES,
  Level,
  MEASURE_STATUS_NAMES,
  Period,
  RISK_STATUS_NAMES,
  RiskStatus,
  levelOf,
} from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';
import { PageHeader } from '../../ui/page-header';
import { RiskStatusChip } from '../../ui/risk-status';

type WidgetId =
  | 'status'
  | 'attention'
  | 'sum'
  | 'dirs'
  | 'top'
  | 'heat'
  | 'levels'
  | 'kri'
  | 'mitig'
  | 'dyn'
  | 'appr';

interface Slot {
  id: WidgetId;
  span: number;
}

const WIDGETS: Record<WidgetId, { title: string; desc: string; sizes: number[] }> = {
  status: { title: 'Риски по статусам', desc: 'Счётчики по пяти статусам риска', sizes: [12] },
  attention: {
    title: 'Требуют внимания',
    desc: 'Топ-риски, без оценки, ждут решения, меры',
    sizes: [12, 6],
  },
  sum: {
    title: 'Общая сумма рисков',
    desc: 'Сумма последствий активных рисков',
    sizes: [7, 6, 12],
  },
  dirs: {
    title: 'Распределение по дирекциям',
    desc: 'Статусы рисков выбранной дирекции',
    sizes: [5, 6, 12],
  },
  top: { title: 'Последние топ-риски', desc: 'Карусель карточек топ-рисков', sizes: [12] },
  heat: { title: 'Тепловая карта 5×5', desc: 'Вероятность × тяжесть', sizes: [5, 6, 12] },
  levels: {
    title: 'Уровни принятия',
    desc: 'OWNER, DIRECTOR, CEO, TREATMENT_REQUIRED',
    sizes: [7, 6, 12],
  },
  kri: { title: 'KRI', desc: 'Ключевые индикаторы риска', sizes: [7, 6, 12] },
  mitig: { title: 'Статус митигации', desc: 'Выполнение мер', sizes: [5, 4, 6] },
  dyn: { title: 'Динамика выявления', desc: 'Новые риски по неделям', sizes: [7, 8, 12] },
  appr: {
    title: 'Согласования мер',
    desc: 'Очередь запросов по порогам стоимости',
    sizes: [5, 6, 12],
  },
};

const PRESETS: Record<'figma' | 'exec', Slot[]> = {
  figma: [
    { id: 'status', span: 12 },
    { id: 'attention', span: 12 },
    { id: 'sum', span: 7 },
    { id: 'dirs', span: 5 },
    { id: 'top', span: 12 },
  ],
  exec: [
    { id: 'attention', span: 12 },
    { id: 'heat', span: 5 },
    { id: 'levels', span: 7 },
    { id: 'kri', span: 7 },
    { id: 'mitig', span: 5 },
    { id: 'top', span: 12 },
  ],
};

const PERIODS: { key: Period; name: string }[] = [
  { key: 'week', name: 'Неделя' },
  { key: 'month', name: 'Месяц' },
  { key: 'quarter', name: 'Квартал' },
  { key: 'year', name: 'Год' },
];

const STATUSES: RiskStatus[] = ['DRAFT', 'ACTIVE', 'REASSESSMENT', 'ACCEPTED', 'CLOSED'];
const STATUS_PLURAL: Record<RiskStatus | 'all', string> = {
  all: 'Всего рисков',
  DRAFT: 'Черновики',
  ACTIVE: 'Активные',
  REASSESSMENT: 'На переоценке',
  ACCEPTED: 'Принятые',
  CLOSED: 'Закрытые',
};
const LEVELS: Level[] = ['OWNER', 'DIRECTOR', 'CEO', 'TREATMENT_REQUIRED'];

@Component({
  selector: 'app-dashboard',
  imports: [
    PageHeader,
    Icon,
    RiskStatusChip,
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly api = inject(RisksApi);

  protected readonly period = signal<Period>('quarter');
  protected readonly data = httpResource<DashboardData>(() => ({
    url: `${API}/dashboard`,
    params: { period: this.period() },
  }));
  protected readonly dict = this.api.dictionaries;
  protected readonly thresholds = computed(
    () => this.dict.value()?.thresholds ?? { owner: 10, director: 15, ceo: 19 },
  );

  protected readonly widgets = WIDGETS;
  protected readonly periods = PERIODS;
  protected readonly statuses = STATUSES;
  protected readonly levels = LEVELS;
  protected readonly statusNames = RISK_STATUS_NAMES;
  protected readonly measureNames = MEASURE_STATUS_NAMES;
  protected readonly likelihoodNames = LIKELIHOOD_NAMES;
  protected readonly impactNames = IMPACT_NAMES;
  protected readonly rub = rub;
  protected readonly date = date;
  protected readonly Math = Math;

  // ── Layout ────────────────────────────────────────────────────────────────
  // ponytail: layout lives in this browser per user; move it to the user profile API when it exists.
  private readonly key = `rms.dashboard.${this.auth.user()?.id}`;
  protected readonly layout = signal<Slot[]>(this.load());
  protected readonly customize = signal(false);

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(this.key, JSON.stringify(this.layout()));
      } catch {}
    });
  }

  private load(): Slot[] {
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) ?? 'null') as Slot[] | null;
      if (saved?.every((s) => WIDGETS[s.id])) return saved;
    } catch {}
    return PRESETS.figma;
  }

  protected readonly library = computed(() =>
    (Object.keys(WIDGETS) as WidgetId[]).map((id) => ({
      id,
      ...WIDGETS[id],
      shown: this.layout().some((s) => s.id === id),
    })),
  );
  protected readonly preset = computed(() =>
    (Object.keys(PRESETS) as ('figma' | 'exec')[]).find(
      (k) => JSON.stringify(PRESETS[k]) === JSON.stringify(this.layout()),
    ),
  );

  protected applyPreset(k: 'figma' | 'exec'): void {
    this.layout.set(PRESETS[k]);
  }

  protected toggleWidget(id: WidgetId): void {
    this.layout.update((l) =>
      l.some((s) => s.id === id)
        ? l.filter((s) => s.id !== id)
        : [...l, { id, span: WIDGETS[id].sizes[0] }],
    );
  }

  protected move(index: number, by: -1 | 1): void {
    this.layout.update((l) => {
      const next = [...l];
      moveItemInArray(next, index, index + by);
      return next;
    });
  }

  protected drop(e: CdkDragDrop<Slot[]>): void {
    this.layout.update((l) => {
      const next = [...l];
      moveItemInArray(next, e.previousIndex, e.currentIndex);
      return next;
    });
  }

  protected cycleWidth(index: number): void {
    this.layout.update((l) =>
      l.map((s, k) => {
        if (k !== index) return s;
        const sizes = WIDGETS[s.id].sizes;
        return { ...s, span: sizes[(sizes.indexOf(s.span) + 1) % sizes.length] };
      }),
    );
  }

  protected widthLabel(span: number): string {
    return span === 12 ? 'Во всю ширину' : `${span}/12`;
  }

  // ── Hero ──────────────────────────────────────────────────────────────────
  protected readonly greeting = computed(() => {
    const d = this.data.value();
    const [last = '', first] = this.auth.user()?.fullName.split(' ') ?? [];
    const h = new Date().getHours();
    const hello = h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
    return d
      ? `${hello}, ${first ?? last}. ${d.attention.decision} рисков ждут решения о принятии, ${d.attention.measuresApproval} мер ждут согласования.`
      : `${hello}, ${first ?? last}.`;
  });

  protected async exportCsv(): Promise<void> {
    await this.api.export({});
  }

  protected print(): void {
    window.print();
  }

  // ── Widget helpers ────────────────────────────────────────────────────────
  protected statusLabel(s: string): string {
    return STATUS_PLURAL[s as RiskStatus | 'all'];
  }

  protected statusCount(s: RiskStatus | 'all'): { n: number; delta: number } {
    return this.data.value()?.statuses.find((x) => x.status === s) ?? { n: 0, delta: 0 };
  }

  protected million(n: number): string {
    return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} млн ₽` : rub(n);
  }

  /** Smooth SVG path (Catmull-Rom → Bézier) over the weekly totals, in a 600×220 box. */
  protected readonly sumChart = computed(() => {
    const s = this.data.value()?.sum.series ?? [];
    if (s.length < 2) return null;
    const max = Math.max(...s.map((p) => p.value)) * 1.1 || 1;
    const min = Math.min(...s.map((p) => p.value)) * 0.85;
    const pts = s.map((p, i) => [
      (i / (s.length - 1)) * 600,
      220 - ((p.value - min) / (max - min)) * 220,
    ]);
    let line = `M${pts[0][0]} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)],
        p1 = pts[i],
        p2 = pts[i + 1],
        p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      line += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => this.million(max - (max - min) * k));
    const first = s.find((p) => p.value > 0)?.value || 1;
    return {
      line,
      area: `${line} L600 220 L0 220 Z`,
      lastTop: `${(pts.at(-1)![1] / 220) * 100}%`,
      ticks,
      growth: Math.round(((s.at(-1)!.value - first) / first) * 100),
      labels: [s[0], s[Math.floor(s.length / 2)], s.at(-1)!].map((p) => date(p.date).slice(0, 5)),
    };
  });

  protected readonly dir = signal('');
  protected readonly dirData = computed(() => {
    const d = this.data.value();
    if (!d) return null;
    const pick = this.dir();
    const rows = pick ? d.directorates.filter((x) => x.name === pick) : d.directorates;
    const counts = Object.fromEntries(
      STATUSES.map((s) => [s, rows.reduce((a, r) => a + r.counts[s], 0)]),
    ) as Record<RiskStatus, number>;
    const total = STATUSES.reduce((a, s) => a + counts[s], 0);
    let acc = 0;
    const stops = STATUSES.map((s) => {
      const start = acc;
      acc += total ? (counts[s] / total) * 100 : 0;
      return `var(--dot-${s === 'DRAFT' ? 'draft' : s === 'ACTIVE' ? 'active' : s === 'REASSESSMENT' ? 'review' : s === 'ACCEPTED' ? 'accepted' : 'closed'}) ${start}% ${acc}%`;
    });
    return {
      counts,
      total,
      loss: rows.reduce((a, r) => a + r.loss, 0),
      donut: `conic-gradient(${stops.join(', ')})`,
    };
  });

  protected readonly topIndex = signal(0);
  protected readonly topVisible = computed(() =>
    (this.data.value()?.top ?? []).slice(this.topIndex(), this.topIndex() + 3),
  );

  protected level(score: number): Level {
    return levelOf(score, this.thresholds());
  }

  protected range(lv: Level): string {
    return levelRange(lv, this.thresholds());
  }

  protected readonly heatMax = computed(() =>
    Math.max(1, ...(this.data.value()?.heat.flat() ?? [1])),
  );
  protected heatStyle(l: number, i: number, n: number): string {
    const v = { OWNER: 'owner', DIRECTOR: 'director', CEO: 'ceo', TREATMENT_REQUIRED: 'treatment' }[
      this.level(l * i)
    ];
    const a = n ? 14 + Math.round((n / this.heatMax()) * 50) : 5;
    return `background: color-mix(in srgb, var(--lv-${v}-hue) ${a}%, transparent)`;
  }

  protected readonly assessedTotal = computed(() =>
    Object.values(this.data.value()?.levels ?? {}).reduce((a, b) => a + b, 0),
  );
  protected bubbleSize(n: number): number {
    const max = Math.max(1, ...Object.values(this.data.value()?.levels ?? {}));
    return Math.max(72, Math.round(Math.sqrt(n / max) * 200));
  }

  protected readonly mitig = computed(() => {
    const m = this.data.value()?.mitigation;
    if (!m) return null;
    const parts = [
      { label: 'Готово', n: m.DONE, color: 'var(--ms-done-fg)' },
      { label: 'В работе', n: m.IN_PROGRESS + m.HOLD, color: 'var(--ms-progress-fg)' },
      { label: 'Ожидает выполнения', n: m.PENDING + m.APPROVED, color: 'var(--ms-pending-fg)' },
      { label: 'На согласовании', n: m.APPROVAL, color: 'var(--ms-approval-fg)' },
    ];
    const total = parts.reduce((a, p) => a + p.n, 0);
    let acc = 0;
    const ring = parts
      .map((p) => {
        const s = acc;
        acc += total ? (p.n / total) * 100 : 0;
        return `${p.color} ${s}% ${acc}%`;
      })
      .join(', ');
    return {
      parts,
      total,
      pct: total ? Math.round((m.DONE / total) * 100) : 0,
      ring: `conic-gradient(${ring})`,
    };
  });

  protected readonly dynMax = computed(() =>
    Math.max(4, ...(this.data.value()?.dynamics.map((d) => d.total) ?? [4])),
  );

  protected waitDays(iso: string): string {
    const n = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
    return n <= 0 ? 'сегодня' : `${n} дн.`;
  }
}
