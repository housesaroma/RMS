import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { downloadCsv } from '../../core/csv';
import { date, daysLeft, rub } from '../../core/format';
import {
  DashboardData,
  MEASURE_STATUS_NAMES,
  MeasureStatus,
  Period,
  RISK_STATUS_NAMES,
  ReportRecord,
  ReportsData,
  levelOf,
} from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';
import { MeasureStatusChip } from '../../ui/measure-status';
import { PageHeader } from '../../ui/page-header';
import { RiskScore } from '../../ui/risk-score';
import { RiskStatusChip } from '../../ui/risk-status';

type Tab = 'assign' | 'top' | 'dec' | 'sum';

const TABS: { key: Tab; name: string; note: string }[] = [
  {
    key: 'assign',
    name: 'По поручениям',
    note: 'Меры, переданные к выполнению: исполнитель, контролёр и срок.',
  },
  {
    key: 'top',
    name: 'По топ-рискам',
    note: 'Топ-риски с оценкой, суммой последствий и ходом мер.',
  },
  {
    key: 'dec',
    name: 'Решения по рискам',
    note: 'Журнал решений: принятие, выбор режима, закрытие и завершение циклов мер.',
  },
  {
    key: 'sum',
    name: 'Сводный отчёт',
    note: 'Сводка рисков, heat-map 5×5, топ-5 и статус мер: печать в PDF или CSV.',
  },
];

const ASSIGN_STATUSES: MeasureStatus[] = ['PENDING', 'IN_PROGRESS', 'HOLD', 'DONE'];
const PERIODS: { key: Period; name: string }[] = [
  { key: 'month', name: 'Последний месяц' },
  { key: 'quarter', name: 'Последний квартал' },
  { key: 'year', name: 'Последний год' },
];
const TEMPLATES = ['Audit Snapshot', 'Для руководства', 'Для аудита ISO 9001'];
const SECTIONS = [
  { key: 'kpi', name: 'Сводка рисков' },
  { key: 'heat', name: 'Heat-map 5×5' },
  { key: 'top', name: 'Топ-5 рисков' },
  { key: 'meas', name: 'Статус мер' },
] as const;

@Component({
  selector: 'app-reports',
  imports: [PageHeader, Icon, RouterLink, MeasureStatusChip, RiskStatusChip, RiskScore],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  protected readonly dict = inject(RisksApi).dictionaries;

  readonly tab = input<Tab>();
  protected readonly current = computed<Tab>(() => this.tab() ?? 'assign');
  protected readonly tabs = TABS;
  protected readonly note = computed(() => TABS.find((t) => t.key === this.current())!.note);

  protected readonly data = httpResource<ReportsData>(() => `${API}/reports`);
  protected readonly thresholds = computed(
    () => this.dict.value()?.thresholds ?? { owner: 10, director: 15, ceo: 19 },
  );

  protected readonly rub = rub;
  protected readonly date = date;
  protected readonly measureNames = MEASURE_STATUS_NAMES;
  protected readonly riskNames = RISK_STATUS_NAMES;

  protected setTab(t: Tab): void {
    this.router.navigate([], { queryParams: t === 'assign' ? {} : { tab: t }, replaceUrl: true });
  }

  // ── Assignments ───────────────────────────────────────────────────────────
  protected readonly assignStatuses = ASSIGN_STATUSES;
  protected readonly aStatus = signal<MeasureStatus | ''>('');
  protected readonly aQuery = signal('');
  protected readonly aDir = signal('');
  protected readonly aExec = signal('');
  private readonly assignBase = computed(() => {
    const q = this.aQuery().trim().toLowerCase();
    return (this.data.value()?.assignments ?? []).filter(
      (m) =>
        (!q ||
          [m.id, m.title, m.riskId, m.executor ?? ''].some((x) => x.toLowerCase().includes(q))) &&
        (!this.aDir() || m.directorate === this.aDir()) &&
        (!this.aExec() || m.executor === this.aExec()),
    );
  });
  protected readonly assignments = computed(() =>
    this.assignBase().filter((m) => !this.aStatus() || m.status === this.aStatus()),
  );
  protected assignCount(s: MeasureStatus | ''): number {
    return this.assignBase().filter((m) => !s || m.status === s).length;
  }
  protected readonly executors = computed(() =>
    [...new Set((this.data.value()?.assignments ?? []).map((m) => m.executor!))].sort((a, b) =>
      a.localeCompare(b, 'ru'),
    ),
  );
  protected late(m: { status: MeasureStatus; dueDate: string }): number {
    return m.status === 'DONE' || m.status === 'CANCELLED' ? 0 : Math.max(0, -daysLeft(m.dueDate));
  }
  protected readonly lateCount = computed(
    () => this.assignments().filter((m) => this.late(m) > 0).length,
  );

  // ── Top risks ─────────────────────────────────────────────────────────────
  protected readonly tQuery = signal('');
  protected readonly top = computed(() => {
    const q = this.tQuery().trim().toLowerCase();
    return (this.data.value()?.top ?? []).filter(
      (t) =>
        !q ||
        [t.risk.id, t.risk.name, t.risk.process, t.risk.owner].some((x) =>
          x.toLowerCase().includes(q),
        ),
    );
  });

  // ── Decisions ─────────────────────────────────────────────────────────────
  protected readonly dQuery = signal('');
  protected readonly dKind = signal('');
  protected readonly kinds = [
    'Принят',
    'Обработать',
    'Закрыт',
    'Цикл мер завершён',
    'Возвращён из архива',
  ];
  protected readonly decisions = computed(() => {
    const q = this.dQuery().trim().toLowerCase();
    return (this.data.value()?.decisions ?? []).filter(
      (e) =>
        (!q || [e.riskId, e.riskName, e.by, e.text].some((x) => x.toLowerCase().includes(q))) &&
        (!this.dKind() || this.kindOf(e.text) === this.dKind()),
    );
  });
  protected kindOf(text: string): string {
    if (text.includes('принят')) return 'Принят';
    if (text.includes('Обработать')) return 'Обработать';
    if (text.includes('закрыт')) return 'Закрыт';
    if (text.includes('Цикл')) return 'Цикл мер завершён';
    if (text.includes('возвращён')) return 'Возвращён из архива';
    return 'Решение';
  }

  // ── Summary report ────────────────────────────────────────────────────────
  protected readonly templates = TEMPLATES;
  protected readonly periods = PERIODS;
  protected readonly sections = SECTIONS;
  protected readonly mitigStatuses: MeasureStatus[] = [
    'APPROVAL',
    'APPROVED',
    'PENDING',
    'IN_PROGRESS',
    'HOLD',
    'DONE',
  ];
  protected readonly template = signal(TEMPLATES[0]);
  protected readonly period = signal<Period>('quarter');
  protected readonly dirs = signal<string[]>([]);
  protected readonly shown = signal<Record<string, boolean>>({
    kpi: true,
    heat: true,
    top: true,
    meas: true,
  });
  protected readonly format = signal<'PDF' | 'CSV'>('PDF');

  protected readonly allDirs = computed(() => this.dict.value()?.directorates ?? []);
  protected readonly scope = computed(() => (this.dirs().length ? this.dirs() : this.allDirs()));
  protected readonly summary = httpResource<DashboardData>(() =>
    this.current() === 'sum'
      ? {
          url: `${API}/dashboard`,
          params: {
            period: this.period(),
            ...(this.dirs().length ? { directorates: this.dirs().join(',') } : {}),
          },
        }
      : undefined,
  );
  protected readonly topFive = computed(() =>
    [...(this.summary.value()?.top ?? [])]
      .filter((r) => r.assessment)
      .sort((a, b) => b.assessment!.score - a.assessment!.score)
      .slice(0, 5),
  );
  protected readonly canGenerate = computed(() => Object.values(this.shown()).some(Boolean));
  protected readonly reportTitle = computed(
    () =>
      `Сводный отчёт по рискам · ${PERIODS.find((p) => p.key === this.period())!.name.toLowerCase()}`,
  );

  protected toggleDir(name: string): void {
    this.dirs.update((d) => (d.includes(name) ? d.filter((x) => x !== name) : [...d, name]));
  }
  protected toggleSection(key: string): void {
    this.shown.update((s) => ({ ...s, [key]: !s[key] }));
  }
  protected level(score: number): string {
    return levelOf(score, this.thresholds());
  }

  protected readonly history = httpResource<ReportRecord[]>(() =>
    this.current() === 'sum' ? `${API}/reports/history` : undefined,
  );

  protected async generate(): Promise<void> {
    if (!this.canGenerate()) return;
    this.output(this.format());
    await firstValueFrom(
      this.http.post(`${API}/reports/history`, {
        title: this.reportTitle(),
        template: this.template(),
        format: this.format(),
      }),
    );
    this.history.reload();
  }

  /** PDF is the browser's print of the preview; CSV holds the same figures as tables. */
  protected output(format: 'PDF' | 'CSV'): void {
    if (format === 'PDF') {
      document.body.classList.add('print-report');
      window.print();
      document.body.classList.remove('print-report');
      return;
    }
    const d = this.summary.value();
    if (!d) return;
    const rows: unknown[][] = [];
    for (const s of d.statuses)
      rows.push(['Риски', s.status === 'all' ? 'Всего' : RISK_STATUS_NAMES[s.status], s.n]);
    for (const [l, row] of d.heat.entries())
      for (const [i, n] of row.entries())
        if (n) rows.push(['Heat-map', `L${l + 1} × I${i + 1}`, n]);
    for (const r of this.topFive()) rows.push(['Топ-5', `${r.id} ${r.name}`, r.assessment!.score]);
    for (const [s, n] of Object.entries(d.mitigation))
      rows.push(['Меры', MEASURE_STATUS_NAMES[s as MeasureStatus], n]);
    downloadCsv('summary-report', ['Раздел', 'Показатель', 'Значение'], rows);
  }

  // ── Tab export ────────────────────────────────────────────────────────────
  protected exportTab(): void {
    switch (this.current()) {
      case 'assign':
        downloadCsv(
          'assignments',
          [
            'ID',
            'Мера',
            'Риск',
            'Дирекция',
            'Процесс',
            'Контролёр',
            'Исполнитель',
            'Начало',
            'Срок',
            'Статус',
          ],
          this.assignments().map((m) => [
            m.id,
            m.title,
            m.riskId,
            m.directorate,
            m.process,
            m.owner,
            m.executor,
            date(m.startedAt),
            date(m.dueDate),
            MEASURE_STATUS_NAMES[m.status],
          ]),
        );
        break;
      case 'top':
        downloadCsv(
          'top-risks',
          [
            'ID',
            'Риск',
            'Дирекция',
            'Процесс',
            'Владелец',
            'R',
            'Сумма последствий',
            'Статус',
            'Мер готово',
            'Мер всего',
          ],
          this.top().map((t) => [
            t.risk.id,
            t.risk.name,
            t.risk.directorate,
            t.risk.process,
            t.risk.owner,
            (t.risk.likelihood ?? 0) * (t.risk.impact ?? 0) || null,
            t.loss,
            RISK_STATUS_NAMES[t.risk.status],
            t.done,
            t.total,
          ]),
        );
        break;
      case 'dec':
        downloadCsv(
          'decisions',
          ['Дата', 'Риск', 'Решение', 'R', 'Кто', 'Роль', 'Комментарий'],
          this.decisions().map((e) => [
            date(e.at, true),
            `${e.riskId} ${e.riskName}`,
            this.kindOf(e.text),
            e.score,
            e.by,
            e.role,
            e.text,
          ]),
        );
        break;
      case 'sum':
        this.output('CSV');
    }
  }
}
