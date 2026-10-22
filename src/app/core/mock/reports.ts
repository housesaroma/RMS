import { Dictionaries, ReportRecord, ReportsData, RiskDetails, User } from '../models';
import { toRow } from './measures';
import { toRisk } from './risks';

/** Report tables built from the same risks and measures as the rest of the app. */
export function reports(all: RiskDetails[], user: User, d: Dictionaries): ReportsData {
  const assignments = all
    .flatMap((r) => r.measures.filter((m) => m.executor).map((m) => ({ m, r })))
    .map(({ m, r }) => ({ ...toRow(m, r, user, d), startedAt: m.decidedAt }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const top = all
    .filter((r) => r.top && r.status !== 'CLOSED')
    .map((r) => {
      const live = r.measures.filter((m) => m.status !== 'CANCELLED');
      return {
        risk: toRisk(r),
        loss: (r.assessment ?? r.previous)?.lossAmount ?? null,
        done: live.filter((m) => m.status === 'DONE').length,
        total: live.length,
      };
    })
    .sort(
      (a, b) =>
        (b.risk.likelihood ?? 0) * (b.risk.impact ?? 0) -
        (a.risk.likelihood ?? 0) * (a.risk.impact ?? 0),
    );

  // Decision journal: accept/treat choices, closures and cycle completions.
  const decisions = all
    .flatMap((r) =>
      r.history
        .filter((e) => e.kind === 'mode' || e.kind === 'system')
        .map((e) => ({
          ...e,
          riskId: r.id,
          riskName: r.name,
          directorate: r.directorate,
          process: r.process,
          score: (r.assessment ?? r.previous)?.score ?? null,
        })),
    )
    .sort((a, b) => b.at.localeCompare(a.at));

  return { assignments, top, decisions };
}

/** Report history from the prototype; new entries are added in memory. */
export const REPORT_HISTORY: ReportRecord[] = [
  {
    id: 'H-5',
    at: '2026-10-11T06:15:00Z',
    title: 'Сводный отчёт по рискам · 3 квартал 2026',
    template: 'Audit Snapshot',
    format: 'PDF',
    by: 'Белов А. Н.',
    status: 'READY',
  },
  {
    id: 'H-4',
    at: '2026-10-10T14:42:00Z',
    title: 'По поручениям · выгрузка вкладки',
    template: 'Выгрузка вкладки',
    format: 'CSV',
    by: 'Кузнецова А. С.',
    status: 'READY',
  },
  {
    id: 'H-3',
    at: '2026-10-09T09:05:00Z',
    title: 'По топ-рискам · выгрузка вкладки',
    template: 'Выгрузка вкладки',
    format: 'CSV',
    by: 'Белов А. Н.',
    status: 'FAILED',
  },
  {
    id: 'H-2',
    at: '2026-10-01T07:30:00Z',
    title: 'Сводный отчёт по рискам · Сентябрь 2026',
    template: 'Для руководства',
    format: 'PDF',
    by: 'Кузнецова А. С.',
    status: 'READY',
  },
];
