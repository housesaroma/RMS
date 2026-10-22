// Business rules shared by the UI (what to enable, why not) and the mock server (what to enforce).
// Source: analytics 07, 09, 10, 11, 13 and 03-roles-and-access.
import {
  ApprovalThresholds,
  AssessmentInput,
  Dictionaries,
  Level,
  MeasureStatus,
  RESPONSE_MODE_NAMES,
  RiskDetails,
  User,
  levelOf,
} from './models';

export interface Gate {
  ok: boolean;
  /** Why the action is unavailable; empty when it is allowed. */
  why: string;
}

const allow: Gate = { ok: true, why: '' };
const deny = (why: string): Gate => ({ ok: false, why });

/** Measures in these statuses block accepting the risk (analytics 10). */
export const ACTIVE_MEASURES: MeasureStatus[] = [
  'APPROVAL',
  'APPROVED',
  'PENDING',
  'IN_PROGRESS',
  'HOLD',
];

/** Impact level 0–5 from money; thresholds are inclusive lower bounds of levels 1–5. */
export function impactOf(loss: number, t: Dictionaries['impactThresholds']): number {
  let level = 0;
  t.forEach((bound, k) => {
    if (loss >= bound) level = k + 1;
  });
  return level;
}

/** Downtime × hourly cost, rounded HALF_UP to kopecks, or the entered amount for risks without an asset. */
export function lossOf(
  input: AssessmentInput,
  hourlyCost: number | null,
): { hours: number | null; loss: number } {
  if (hourlyCost == null) return { hours: null, loss: round2(input.lossAmount ?? 0) };
  const hours = (input.weeks ?? 0) * 168 + (input.days ?? 0) * 24 + (input.hours ?? 0);
  return { hours, loss: round2(hours * hourlyCost) };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type ApprovalLevel = 'NONE' | 'OWNER' | 'DIRECTOR' | 'CEO';

/** The highest reached threshold decides; there is no OWNER → DIRECTOR → CEO chain. */
export function approvalLevel(cost: number, t: ApprovalThresholds): ApprovalLevel {
  return cost >= t.ceo
    ? 'CEO'
    : cost >= t.director
      ? 'DIRECTOR'
      : cost >= t.owner
        ? 'OWNER'
        : 'NONE';
}

export function approverOf(level: ApprovalLevel, process: string, d: Dictionaries): string {
  const p = d.processes.find((x) => x.name === process);
  if (level === 'CEO') return `${d.ceo} · генеральный директор или риск-менеджер с правами CEO`;
  if (level === 'DIRECTOR')
    return `${d.directors[p?.directorate ?? ''] ?? '—'} · директор дирекции «${p?.directorate}»`;
  if (level === 'OWNER') return `${p?.owner ?? '—'} · владелец процесса`;
  return 'Мера сразу передаётся к выполнению';
}

const has = (u: User, right: User['rights'][number]) =>
  u.rights.includes(right) || u.rights.includes('admin');
const isAdmin = (u: User) => u.rights.includes('admin');

export function isPrimaryOwner(r: RiskDetails, u: User, d: Dictionaries): boolean {
  return d.processes.find((p) => p.name === r.process)?.ownerId === u.id;
}

export function currentLevel(r: RiskDetails, d: Dictionaries): Level | null {
  return r.assessment ? levelOf(r.assessment.score, d.thresholds) : null;
}

export function canAssess(r: RiskDetails, u: User, d: Dictionaries): Gate {
  if (r.status !== 'DRAFT' && r.status !== 'REASSESSMENT')
    return deny('Оценка доступна для черновика, переоценка — когда риск ждёт переоценки');
  if (!isAdmin(u) && !isPrimaryOwner(r, u, d))
    return deny(`Оценивает владелец основного процесса: ${r.owner}`);
  if (!has(u, 'assess_risk') || (r.status === 'DRAFT' && !has(u, 'edit_risk')))
    return deny('Недостаточно прав для оценки риска');
  return allow;
}

function needsActiveCycle(r: RiskDetails): Gate | null {
  if (r.status !== 'ACTIVE' || !r.assessment)
    return deny('Режим выбирается для активного риска с текущей оценкой');
  if (r.responseMode)
    return deny(`Режим цикла уже выбран: «${RESPONSE_MODE_NAMES[r.responseMode]}»`);
  return null;
}

export function canTreat(r: RiskDetails, u: User, d: Dictionaries): Gate {
  const cycle = needsActiveCycle(r);
  if (cycle) return cycle;
  if (!isAdmin(u) && !(has(u, 'edit_risk') && isPrimaryOwner(r, u, d)))
    return deny(`Режим выбирает владелец основного процесса: ${r.owner}`);
  return allow;
}

export function canAccept(r: RiskDetails, u: User, d: Dictionaries): Gate {
  const cycle = needsActiveCycle(r);
  if (cycle) return cycle;
  if (r.measures.some((m) => ACTIVE_MEASURES.includes(m.status)))
    return deny('Есть меры на согласовании или в работе');
  const level = currentLevel(r, d)!;
  if (isAdmin(u)) return allow;
  switch (level) {
    case 'TREATMENT_REQUIRED':
      return deny('Риск этого уровня нельзя принять. Выберите обработку риска.');
    case 'OWNER':
      return has(u, 'accept_owner_risk') && isPrimaryOwner(r, u, d)
        ? allow
        : deny(`Риск уровня OWNER принимает владелец основного процесса: ${r.owner}`);
    case 'DIRECTOR':
      // ponytail: director context is the user's primary directorate; switch to org assignments with the real API.
      return has(u, 'accept_director_risk') && u.directorate === r.directorate
        ? allow
        : deny(`Риск уровня DIRECTOR принимает директор дирекции «${r.directorate}»`);
    case 'CEO':
      return has(u, 'accept_ceo_risk')
        ? allow
        : deny('Риск уровня CEO принимает генеральный директор или риск-менеджер');
  }
}

export function canCreateMeasure(r: RiskDetails, u: User): Gate {
  if (r.status !== 'ACTIVE' || !r.assessment)
    return deny('Меры создаются для активного оценённого риска');
  if (r.responseMode !== 'treat' && r.responseMode !== 'split')
    return deny('Сначала выберите режим «Обработать»');
  if (!has(u, 'create_treatment')) return deny('Недостаточно прав для создания мер');
  return allow;
}

export function canComment(u: User): Gate {
  return has(u, 'comment_risk') ? allow : deny('Недостаточно прав для комментариев');
}
