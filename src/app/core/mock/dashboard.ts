import {
  DashboardData,
  Dictionaries,
  Level,
  MeasureStatus,
  Period,
  RiskDetails,
  RiskStatus,
  levelOf,
} from '../models';
import { ACTIVE_MEASURES, approvalLevel } from '../risk-rules';

const DAY = 864e5;
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, quarter: 91, year: 365 };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;

/** Everything the dashboard widgets show, computed from the same data as the registry. */
export function dashboard(
  all: RiskDetails[],
  period: Period,
  d: Dictionaries,
  now = new Date(),
): DashboardData {
  const today = iso(now);
  const from = iso(new Date(now.getTime() - PERIOD_DAYS[period] * DAY));
  const statuses: RiskStatus[] = ['DRAFT', 'ACTIVE', 'REASSESSMENT', 'ACCEPTED', 'CLOSED'];
  const createdIn = (r: RiskDetails) => r.createdAt >= from;
  const measures = all.flatMap((r) => r.measures.map((m) => ({ m, r })));
  const assessed = all.filter((r) => r.assessment);
  const active = all.filter((r) => r.status === 'ACTIVE' && r.assessment);
  const top = all.filter((r) => r.top && r.status !== 'CLOSED');
  const unassessed = all.filter((r) => r.status === 'DRAFT' || r.status === 'REASSESSMENT');

  // Weekly points ending today; loss of risks active (assessed) at that moment, as far as the data tells.
  const weeks = Math.min(13, Math.max(4, Math.round(PERIOD_DAYS[period] / 7)));
  const points = Array.from({ length: weeks }, (_, k) =>
    iso(new Date(now.getTime() - (weeks - 1 - k) * 7 * DAY)),
  );
  const series = points.map((date) => ({
    date,
    value: all
      .filter((r) => r.assessment && r.assessment.at.slice(0, 10) <= date && r.status !== 'CLOSED')
      .reduce((s, r) => s + r.assessment!.lossAmount, 0),
  }));

  const heat = [1, 2, 3, 4, 5].map((l) =>
    [1, 2, 3, 4, 5].map(
      (i) =>
        assessed.filter((r) => r.assessment!.likelihood === l && r.assessment!.impact === i).length,
    ),
  );
  const levels = { OWNER: 0, DIRECTOR: 0, CEO: 0, TREATMENT_REQUIRED: 0 } as Record<Level, number>;
  for (const r of assessed) levels[levelOf(r.assessment!.score, d.thresholds)]++;

  const mitigation = Object.fromEntries(
    (
      [
        'DRAFT',
        'APPROVAL',
        'APPROVED',
        'PENDING',
        'IN_PROGRESS',
        'HOLD',
        'DONE',
        'CANCELLED',
      ] as MeasureStatus[]
    ).map((s) => [s, measures.filter(({ m }) => m.status === s).length]),
  ) as Record<MeasureStatus, number>;

  // KRI: an example set from the prototype; the final list is approved by the customer.
  const unassessedOld = unassessed.filter((r) => days(r.createdAt, today) > 14).length;
  const overdue = measures.filter(
    ({ m }) => ACTIVE_MEASURES.includes(m.status) && m.dueDate < today,
  ).length;
  const tr = active.filter(
    (r) => levelOf(r.assessment!.score, d.thresholds) === 'TREATMENT_REQUIRED',
  );
  const trBare = tr.filter(
    (r) => !r.measures.some((m) => ACTIVE_MEASURES.includes(m.status) || m.status === 'DONE'),
  ).length;
  const firstAssessment = assessed.map((r) =>
    days(
      r.createdAtTime,
      r.history.filter((e) => e.kind === 'assess').at(-1)?.at ?? r.assessment!.at,
    ),
  );
  const avg = firstAssessment.length
    ? firstAssessment.reduce((a, b) => a + b, 0) / firstAssessment.length
    : 0;
  const slowApprovals = measures.filter(
    ({ m }) => m.status === 'APPROVAL' && days(m.sentAt!, now.toISOString()) > 5,
  ).length;
  const kri: DashboardData['kri'] = [
    {
      name: 'Риски без оценки дольше 14 дней',
      value: String(unassessedOld),
      limit: '≤ 3',
      ...state(unassessedOld, 3),
    },
    { name: 'Меры с истёкшим сроком', value: String(overdue), limit: '≤ 2', ...state(overdue, 2) },
    {
      name: 'TREATMENT_REQUIRED без мер',
      value: `${trBare} из ${tr.length}`,
      limit: '0',
      ...state(trBare, 0),
    },
    {
      name: 'Среднее время до первичной оценки',
      value: `${avg.toFixed(1).replace('.', ',')} дн.`,
      limit: '≤ 5 дн.',
      ...state(avg, 5),
    },
    {
      name: 'Запросы на согласовании дольше 5 дней',
      value: String(slowApprovals),
      limit: '≤ 2',
      ...state(slowApprovals, 2),
    },
  ];

  return {
    period,
    from,
    to: today,
    statuses: [
      { status: 'all', n: all.length, delta: all.filter(createdIn).length },
      ...statuses.map((s) => ({
        status: s,
        n: all.filter((r) => r.status === s).length,
        delta: all.filter((r) => r.status === s && createdIn(r)).length,
      })),
    ],
    attention: {
      top: top.length,
      topCritical: top.filter((r) => r.assessment && r.assessment.score > d.thresholds.ceo).length,
      topUnassessed: top.filter((r) => !r.assessment).length,
      unassessed: unassessed.length,
      unassessedOld,
      decision: active.filter((r) => !r.responseMode).length,
      measuresActive: measures.filter(
        ({ m }) => m.status === 'IN_PROGRESS' || m.status === 'PENDING',
      ).length,
      measuresApproval: mitigation.APPROVAL,
    },
    sum: { total: series.at(-1)!.value, series },
    directorates: d.directorates.map((name) => {
      const own = all.filter((r) => r.directorate === name);
      return {
        name,
        counts: Object.fromEntries(
          statuses.map((s) => [s, own.filter((r) => r.status === s).length]),
        ) as Record<RiskStatus, number>,
        loss: own
          .filter((r) => r.status === 'ACTIVE')
          .reduce((s, r) => s + (r.assessment?.lossAmount ?? 0), 0),
      };
    }),
    top: top
      .sort((a, b) => b.createdAtTime.localeCompare(a.createdAtTime))
      .map((r) => ({ ...r, history: [], comments: [] })),
    heat,
    levels,
    kri,
    mitigation,
    dynamics: points.slice(-7).map((week) => {
      const start = iso(new Date(new Date(week).getTime() - 6 * DAY));
      const made = all.filter((r) => r.createdAt >= start && r.createdAt <= week);
      return { week, total: made.length, unassessed: made.filter((r) => !r.assessment).length };
    }),
    approvals: measures
      .filter(({ m }) => m.status === 'APPROVAL')
      .map(({ m, r }) => ({
        id: m.id,
        title: m.title,
        riskId: r.id,
        cost: m.costPlanned,
        level: approvalLevel(m.costPlanned, d.approval),
        sentAt: m.sentAt!,
      }))
      .sort((a, b) => b.cost - a.cost),
  };
}

/** Progress towards the limit: ok below it, warn at it, bad above. */
function state(value: number, limit: number): { state: 'ok' | 'warn' | 'bad'; pct: number } {
  const pct = Math.min(100, Math.round(limit ? (value / (limit * 1.1)) * 100 : value ? 100 : 0));
  return { state: value > limit ? 'bad' : value === limit && limit > 0 ? 'warn' : 'ok', pct };
}
