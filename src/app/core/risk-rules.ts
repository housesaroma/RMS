// Business rules shared by the UI (what to enable, why not) and the mock server (what to enforce).
// Source: analytics 07, 09, 10, 11, 13 and 03-roles-and-access.
import {
  ApprovalLevel,
  ApprovalThresholds,
  AssessmentInput,
  Dictionaries,
  Level,
  Measure,
  MeasureAction,
  MeasureActionInput,
  MeasureStatus,
  Process,
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

/** Closing (analytics 10): no measure in work or under approval; owner of the primary process or admin. */
export function canClose(r: RiskDetails, u: User, d: Dictionaries): Gate {
  if (r.status === 'CLOSED') return deny('Риск уже закрыт');
  if (r.measures.some((m) => ACTIVE_MEASURES.includes(m.status)))
    return deny('Есть меры на согласовании или в работе: завершите или отмените их');
  if (!isAdmin(u) && !(has(u, 'close_risk') && isPrimaryOwner(r, u, d)))
    return deny(`Закрывает владелец основного процесса: ${r.owner}`);
  return allow;
}

/** Return from the archive: to reassessment, or back to draft if it was never assessed. */
export function canReopen(r: RiskDetails, u: User, d: Dictionaries): Gate {
  if (r.status !== 'CLOSED') return deny('Вернуть можно только закрытый риск');
  if (!isAdmin(u) && !(has(u, 'edit_risk') && isPrimaryOwner(r, u, d)))
    return deny(`Возвращает владелец процесса: ${r.owner}`);
  return allow;
}

export function canComment(u: User): Gate {
  return has(u, 'comment_risk') ? allow : deny('Недостаточно прав для комментариев');
}

// ── Measures (analytics 11, 12, 13) ────────────────────────────────────────────

/** Statuses that hold the per-directorate slot of a risk (11, rules 20–22). Hold is not one of them. */
export const SLOT_STATUSES: MeasureStatus[] = ['APPROVAL', 'APPROVED', 'PENDING', 'IN_PROGRESS'];

export const MEASURE_ACTION_NAMES: Record<MeasureAction, string> = {
  send: 'Отправить на согласование',
  handover: 'Передать к выполнению',
  approve: 'Согласовать',
  reject: 'Отклонить',
  revoke: 'Отозвать',
  start: 'Начать выполнение',
  hold: 'Приостановить',
  resume: 'Возобновить',
  finish: 'Завершить',
  cancel: 'Отменить меру',
};

/** Actions offered for each status, in menu order. */
export const ACTIONS_BY_STATUS: Record<MeasureStatus, MeasureAction[]> = {
  DRAFT: ['send', 'handover', 'cancel'],
  APPROVAL: ['approve', 'reject', 'revoke'],
  APPROVED: ['handover', 'revoke'],
  PENDING: ['start', 'cancel'],
  IN_PROGRESS: ['finish', 'hold', 'cancel'],
  HOLD: ['resume'],
  DONE: [],
  CANCELLED: [],
};

export function processOf(m: Measure, d: Dictionaries): Process | undefined {
  return d.processes.find((p) => p.name === m.process);
}

function directorateOf(processName: string, d: Dictionaries): string | undefined {
  return d.processes.find((p) => p.name === processName)?.directorate;
}

/** Another measure of the same risk and directorate that already holds the slot. */
export function slotTakenBy(r: RiskDetails, m: Measure, d: Dictionaries): Measure | undefined {
  const dir = directorateOf(m.process, d);
  return r.measures.find(
    (x) => x.id !== m.id && SLOT_STATUSES.includes(x.status) && directorateOf(x.process, d) === dir,
  );
}

/** Employees of the measure's directorate (12, §3). */
export function executorsFor(m: Measure, d: Dictionaries): string[] {
  return d.staff[directorateOf(m.process, d) ?? ''] ?? [];
}

const isMeasureOwner = (m: Measure, u: User, d: Dictionaries) => processOf(m, d)?.ownerId === u.id;

/** Whether the user may decide an approval request of this level for this measure. */
export function canDecide(level: ApprovalLevel, m: Measure, u: User, d: Dictionaries): boolean {
  if (isAdmin(u)) return true;
  if (level === 'OWNER') return has(u, 'approve_owner_treatment') && isMeasureOwner(m, u, d);
  if (level === 'DIRECTOR')
    return has(u, 'approve_director_treatment') && u.directorate === directorateOf(m.process, d);
  if (level === 'CEO') return has(u, 'approve_ceo_treatment');
  return false;
}

function activeCycle(r: RiskDetails): Gate | null {
  if (r.status !== 'ACTIVE' || !r.assessment)
    return deny('Риск ждёт переоценки: активировать меры нельзя');
  if (r.responseMode !== 'treat' && r.responseMode !== 'split')
    return deny('Режим цикла не «Обработать» и не «Разделить»');
  return null;
}

function slotFree(r: RiskDetails, m: Measure, d: Dictionaries): Gate | null {
  const other = slotTakenBy(r, m, d);
  return other ? deny(`В дирекции уже есть мера ${other.id} в работе или на согласовании`) : null;
}

/**
 * Whether the user may run an action on a measure, and why not.
 * Input is checked only when given (the server passes it; the UI asks for it afterwards).
 */
export function canMeasure(
  action: MeasureAction,
  m: Measure,
  r: RiskDetails,
  u: User,
  d: Dictionaries,
  input?: MeasureActionInput,
): Gate {
  if (!ACTIONS_BY_STATUS[m.status].includes(action))
    return deny('Действие недоступно в текущем статусе меры');
  const owner = processOf(m, d)?.owner ?? '—';
  const executes = isAdmin(u) || (has(u, 'execute_treatment') && isMeasureOwner(m, u, d));
  const level = approvalLevel(m.costPlanned, d.approval);
  const open = m.requests.find((q) => q.status === 'APPROVAL');

  switch (action) {
    case 'send': {
      if (!executes) return deny(`Отправляет владелец процесса меры: ${owner}`);
      if (level === 'NONE') return deny('Согласование не требуется: передайте меру к выполнению');
      // ponytail: every level is assumed to have an approver in the demo org; check org assignments with the real API.
      return activeCycle(r) ?? slotFree(r, m, d) ?? allow;
    }
    case 'handover': {
      if (!(isAdmin(u) || (executes && has(u, 'assign_treatment_executor'))))
        return deny(`Передаёт к выполнению владелец процесса меры: ${owner}`);
      if (m.status === 'DRAFT' && level !== 'NONE')
        return deny(`Нужно согласование уровня ${level}: сначала отправьте меру`);
      const gate = activeCycle(r) ?? slotFree(r, m, d);
      if (gate) return gate;
      if (input && !executorsFor(m, d).includes(input.executor ?? ''))
        return deny('Выберите исполнителя из сотрудников дирекции процесса');
      return allow;
    }
    case 'approve':
    case 'reject': {
      if (!open || !canDecide(open.level, m, u, d))
        return deny(`Решает ${approverOf(open?.level ?? level, m.process, d)}`);
      if (action === 'reject' && input && !input.reason?.trim())
        return deny('Укажите причину отклонения');
      return allow;
    }
    case 'revoke': {
      if (!isAdmin(u)) return deny('Отозвать запрос может только администратор');
      if (input && !input.reason?.trim()) return deny('Укажите причину отзыва');
      return allow;
    }
    case 'start':
      if (!executes) return deny(`Статус меняет владелец процесса меры: ${owner}`);
      if (!m.executor) return deny('Не назначен исполнитель');
      return slotFree(r, m, d) ?? allow;
    case 'resume':
      if (!executes) return deny(`Статус меняет владелец процесса меры: ${owner}`);
      if (!m.executor) return deny('Не назначен исполнитель');
      return activeCycle(r) ?? slotFree(r, m, d) ?? allow;
    case 'finish':
      if (!executes) return deny(`Статус меняет владелец процесса меры: ${owner}`);
      if (input && !(Number.isFinite(input.costActual) && input.costActual! >= 0))
        return deny('Укажите фактическую стоимость, не меньше 0');
      return allow;
    case 'hold':
    case 'cancel':
      return executes ? allow : deny(`Статус меняет владелец процесса меры: ${owner}`);
  }
}

/** True when this action would close the last active measure and send the risk to reassessment (11, §5.5). */
export function endsCycle(action: MeasureAction, m: Measure, r: RiskDetails): boolean {
  const closes =
    action === 'finish' ||
    (action === 'cancel' && m.status !== 'DRAFT') ||
    (action === 'revoke' && m.status === 'APPROVED');
  return (
    closes &&
    r.status === 'ACTIVE' &&
    ACTIVE_MEASURES.includes(m.status) &&
    !r.measures.some((x) => x.id !== m.id && ACTIVE_MEASURES.includes(x.status))
  );
}

/** Actions that need extra input or a confirmation before running. */
export const ACTIONS_WITH_FORM: MeasureAction[] = ['reject', 'revoke', 'handover', 'finish'];

/** UC-2-03: a draft is edited by the owner of its primary process or an admin. */
export function canEditRisk(r: RiskDetails, u: User, d: Dictionaries): Gate {
  if (r.status !== 'DRAFT') return deny('Редактируется только черновик');
  if (!isAdmin(u) && !(has(u, 'edit_risk') && isPrimaryOwner(r, u, d)))
    return deny(`Редактирует владелец основного процесса: ${r.owner}`);
  return allow;
}

export function canEditMeasure(m: Measure, u: User, d: Dictionaries): Gate {
  if (m.status !== 'DRAFT') return deny('Редактируется только мера в черновике');
  if (!isAdmin(u) && !(has(u, 'edit_treatment') && isMeasureOwner(m, u, d)))
    return deny(`Редактирует владелец процесса меры: ${processOf(m, d)?.owner ?? '—'}`);
  return allow;
}
