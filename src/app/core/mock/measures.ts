import { HttpParams } from '@angular/common/http';
import { rub } from '../format';
import {
  ApprovalsPage,
  Dictionaries,
  Measure,
  MeasureActionInput,
  MeasurePage,
  MeasureQuery,
  MeasureRow,
  MeasureStatus,
  RiskDetails,
  User,
} from '../models';
import {
  ACTIONS_BY_STATUS,
  approvalLevel,
  approverOf,
  canDecide,
  canMeasure,
  endsCycle,
  processOf,
} from '../risk-rules';
import { roleOf, shortName } from './risks';

export const MEASURE_PAGE_SIZE = 10;

/** Applies a measure transition; returns an error message or null. Mutates the risk. */
export function transitionMeasure(
  r: RiskDetails,
  measureId: string,
  input: MeasureActionInput,
  user: User,
  d: Dictionaries,
  now: string,
): string | null {
  const m = r.measures.find((x) => x.id === measureId);
  if (!m) return 'Мера не найдена';
  const gate = canMeasure(input.action, m, r, user, d, input);
  if (!gate.ok) return gate.why;

  const by = shortName(user.fullName);
  const ends = endsCycle(input.action, m, r);
  const open = m.requests.find((q) => q.status === 'APPROVAL');
  const level = approvalLevel(m.costPlanned, d.approval);
  let text = '';
  let kind: 'measure' | 'approval' | 'done' = 'measure';

  switch (input.action) {
    case 'send':
      m.status = 'APPROVAL';
      m.sentAt = now;
      m.requests.unshift({
        level: level as 'OWNER',
        status: 'APPROVAL',
        sentAt: now,
        sentBy: by,
        decidedAt: null,
        decidedBy: null,
        reason: null,
      });
      text = `${m.id} отправлена на согласование: ${rub(m.costPlanned)}, уровень ${level}`;
      kind = 'approval';
      break;
    case 'approve':
      Object.assign(open!, { status: 'APPROVED', decidedAt: now, decidedBy: by });
      m.status = 'APPROVED';
      m.decidedAt = now;
      text = `${m.id} согласована на уровне ${open!.level}`;
      kind = 'approval';
      break;
    case 'reject':
      Object.assign(open!, {
        status: 'REJECTED',
        decidedAt: now,
        decidedBy: by,
        reason: input.reason!.trim(),
      });
      m.status = 'DRAFT';
      m.sentAt = null;
      text = `${m.id} отклонена на уровне ${open!.level}. Причина: ${input.reason!.trim()}`;
      kind = 'approval';
      break;
    case 'revoke': {
      const req = m.requests.find((q) => q.status === 'APPROVAL' || q.status === 'APPROVED')!;
      Object.assign(req, {
        status: 'REVOKED',
        decidedAt: now,
        decidedBy: by,
        reason: input.reason!.trim(),
      });
      m.status = m.status === 'APPROVED' ? 'CANCELLED' : 'DRAFT';
      text = `Согласование ${m.id} отозвано администратором. Причина: ${input.reason!.trim()}`;
      kind = 'approval';
      break;
    }
    case 'handover':
      m.status = 'PENDING';
      m.executor = input.executor!;
      if (!m.decidedAt) m.decidedAt = now;
      text = `${m.id} передана к выполнению, исполнитель ${m.executor}`;
      break;
    case 'start':
      m.status = 'IN_PROGRESS';
      text = `${m.id} взята в работу, исполнитель ${m.executor}`;
      break;
    case 'hold':
      m.status = 'HOLD';
      text = `${m.id} приостановлена (Холд)`;
      break;
    case 'resume':
      m.status = 'IN_PROGRESS';
      text = `${m.id} возобновлена`;
      break;
    case 'finish':
      m.status = 'DONE';
      m.costActual = input.costActual!;
      m.doneAt = now;
      text = `${m.id} выполнена: факт ${rub(m.costActual)} при плане ${rub(m.costPlanned)}`;
      kind = 'done';
      break;
    case 'cancel':
      m.status = 'CANCELLED';
      text = `${m.id} отменена`;
      break;
  }

  r.history.unshift({ at: now, text, by, role: roleOf(user), kind });
  if (ends) {
    // 11, §5.5: the cycle ends in the same operation.
    r.previous = r.assessment;
    r.assessment = null;
    r.likelihood = null;
    r.impact = null;
    r.responseMode = null;
    r.modeAt = null;
    r.status = 'REASSESSMENT';
    r.history.unshift({
      at: now,
      text: 'Цикл мер завершён: текущая оценка деактивирована, риск переведён в «Ожидает переоценки»',
      by: 'Система',
      role: 'автоматически',
      kind: 'system',
    });
  }
  return null;
}

export function toRow(m: Measure, r: RiskDetails, user: User, d: Dictionaries): MeasureRow {
  const p = processOf(m, d);
  return {
    ...m,
    riskId: r.id,
    riskName: r.name,
    directorate: p?.directorate ?? '',
    owner: p?.owner ?? '',
    actions: ACTIONS_BY_STATUS[m.status].map((action) => ({
      action,
      ...canMeasure(action, m, r, user, d),
      ends: endsCycle(action, m, r),
    })),
    draftsLeft: r.measures.some((x) => x.id !== m.id && x.status === 'DRAFT'),
  };
}

export function parseMeasureQuery(p: HttpParams): MeasureQuery {
  return {
    tab: p.get('tab') === 'mine' ? 'mine' : 'all',
    status: (p.get('status') as MeasureStatus) ?? '',
    q: p.get('q') ?? '',
    directorate: p.get('directorate') ?? '',
    executor: p.get('executor') ?? '',
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    page: Number(p.get('page')) || 1,
  };
}

/** The user's assignments: measures of processes they own, or where they are the executor. */
const isMine = (m: Measure, u: User, d: Dictionaries) =>
  processOf(m, d)?.ownerId === u.id || m.executor === shortName(u.fullName);

const ORDER: MeasureStatus[] = [
  'APPROVAL',
  'APPROVED',
  'PENDING',
  'IN_PROGRESS',
  'HOLD',
  'DRAFT',
  'DONE',
  'CANCELLED',
];

export function pageMeasures(
  all: RiskDetails[],
  q: MeasureQuery,
  user: User,
  d: Dictionaries,
): MeasurePage {
  const pairs = all.flatMap((r) => r.measures.map((m) => ({ m, r })));
  const mine = pairs.filter(({ m }) => isMine(m, user, d));
  const source = q.tab === 'mine' ? mine : pairs;
  const text = q.q.trim().toLowerCase();
  const base = source.filter(
    ({ m, r }) =>
      (!text ||
        m.title.toLowerCase().includes(text) ||
        m.id.toLowerCase().includes(text) ||
        r.id.toLowerCase().includes(text)) &&
      (!q.directorate || processOf(m, d)?.directorate === q.directorate) &&
      (!q.executor || (q.executor === '—' ? !m.executor : m.executor === q.executor)) &&
      (!q.from || m.dueDate >= q.from) &&
      (!q.to || m.dueDate <= q.to),
  );
  const list = base
    .filter(({ m }) => !q.status || m.status === q.status)
    .sort(
      (a, b) =>
        ORDER.indexOf(a.m.status) - ORDER.indexOf(b.m.status) || b.m.id.localeCompare(a.m.id),
    );
  const counts = Object.fromEntries(
    ORDER.map((s) => [s, base.filter(({ m }) => m.status === s).length]),
  ) as MeasurePage['counts'];
  counts.all = base.length;
  return {
    items: list
      .slice((q.page - 1) * MEASURE_PAGE_SIZE, q.page * MEASURE_PAGE_SIZE)
      .map(({ m, r }) => toRow(m, r, user, d)),
    total: list.length,
    page: q.page,
    pageSize: MEASURE_PAGE_SIZE,
    counts,
    tabs: {
      all: pairs.length,
      mine: mine.length,
      approvals: approvalsFor(all, user, d).pending.filter((x) => x.mine).length,
    },
  };
}

export function approvalsFor(all: RiskDetails[], user: User, d: Dictionaries): ApprovalsPage {
  const pairs = all.flatMap((r) => r.measures.map((m) => ({ m, r })));
  const pending = pairs
    .filter(({ m }) => m.status === 'APPROVAL')
    .map(({ m, r }) => {
      const request = m.requests.find((q) => q.status === 'APPROVAL')!;
      return {
        measure: toRow(m, r, user, d),
        request,
        mine: canDecide(request.level, m, user, d),
        approver: approverOf(request.level, m.process, d),
      };
    })
    .sort(
      (a, b) => Number(b.mine) - Number(a.mine) || a.request.sentAt.localeCompare(b.request.sentAt),
    );
  const history = pairs
    .flatMap(({ m, r }) =>
      m.requests
        .filter((q) => q.status !== 'APPROVAL')
        .map((q) => ({ ...q, measureId: m.id, title: m.title, riskId: r.id })),
    )
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
    .slice(0, 8);
  return { pending, history };
}
