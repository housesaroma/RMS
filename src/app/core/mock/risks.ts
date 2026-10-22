import { HttpParams } from '@angular/common/http';
import {
  AssessmentInput,
  Dictionaries,
  HistoryEvent,
  NewMeasure,
  NewRisk,
  RISK_STATUS_NAMES,
  ROLE_NAMES,
  ResponseMode,
  Risk,
  RiskDetails,
  RiskPage,
  RiskQuery,
  RiskTab,
  User,
  levelOf,
} from '../models';
import {
  canAccept,
  canAssess,
  canComment,
  canCreateMeasure,
  canTreat,
  impactOf,
  lossOf,
} from '../risk-rules';

export const PAGE_SIZE = 10;

const score = (r: Risk) => (r.likelihood ?? 0) * (r.impact ?? 0);

export function parseQuery(p: HttpParams): RiskQuery {
  return {
    tab: (p.get('tab') as RiskTab) || 'all',
    q: p.get('q') ?? '',
    directorate: p.get('directorate') ?? '',
    category: p.get('category') ?? '',
    owner: p.get('owner') ?? '',
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    ceo: p.get('ceo') === 'true',
    sort: (p.get('sort') as RiskQuery['sort']) ?? '',
    page: Number(p.get('page')) || 1,
  };
}

/** Registry filter: closed risks live in the archive, never in the registry list. */
export function filterRisks(all: Risk[], q: RiskQuery, d: Dictionaries): Risk[] {
  const text = q.q.trim().toLowerCase();
  const list = all.filter(
    (r) =>
      r.status !== 'CLOSED' &&
      (q.tab === 'all' || (q.tab === 'top' ? r.top : r.status === q.tab)) &&
      (!q.ceo || score(r) > d.thresholds.director) &&
      (!text || r.name.toLowerCase().includes(text) || r.id.toLowerCase().includes(text)) &&
      (!q.directorate || r.directorate === q.directorate) &&
      (!q.category || r.category === q.category) &&
      (!q.owner || r.owner === q.owner) &&
      (!q.from || r.createdAt >= q.from) &&
      (!q.to || r.createdAt <= q.to),
  );
  return list.sort((a, b) => {
    if (q.sort) {
      const x = score(a),
        y = score(b);
      // Risks without a current assessment always go last.
      if (!x || !y) return (y ? 1 : 0) - (x ? 1 : 0);
      if (x !== y) return q.sort === 'desc' ? y - x : x - y;
    }
    return b.id.localeCompare(a.id);
  });
}

export function pageRisks(all: Risk[], q: RiskQuery, d: Dictionaries): RiskPage {
  const list = filterRisks(all, q, d);
  const open = all.filter((r) => r.status !== 'CLOSED');
  const count = (s: Risk['status']) => all.filter((r) => r.status === s).length;
  return {
    items: list.slice((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE),
    total: list.length,
    page: q.page,
    pageSize: PAGE_SIZE,
    counts: {
      all: open.length,
      top: open.filter((r) => r.top).length,
      DRAFT: count('DRAFT'),
      ACTIVE: count('ACTIVE'),
      REASSESSMENT: count('REASSESSMENT'),
      ACCEPTED: count('ACCEPTED'),
      CLOSED: count('CLOSED'),
    },
  };
}

/** Returns an error message or null; mirrors the server rules of UC-2-02. */
export function validateNewRisk(body: NewRisk, user: User, d: Dictionaries): string | null {
  const isAdmin = user.rights.includes('admin');
  if (!isAdmin && !user.rights.includes('create_risk'))
    return 'Недостаточно прав для создания риска';
  if (
    !body.name.trim() ||
    !body.description.trim() ||
    !body.hazard ||
    !body.category ||
    !body.process
  )
    return 'Заполните обязательные поля';
  const process = d.processes.find((p) => p.name === body.process);
  if (!process) return 'Процесс не найден или неактивен';
  if (!isAdmin && process.directorate !== user.directorate)
    return 'Можно выбрать только процесс своей дирекции';
  if (body.asset && !d.assets.some((a) => a.name === body.asset && a.hourlyDowntimeCost > 0))
    return 'У объекта не указана стоимость простоя';
  return null;
}

const roleOf = (u: User) => u.position || ROLE_NAMES[u.roles[0]];
const shortName = (fullName: string) => {
  const [last, first = '', middle = ''] = fullName.split(' ');
  return `${last} ${first[0] ?? ''}. ${middle[0] ?? ''}.`.replace(' . .', '');
};
const money = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

export function createRisk(
  all: RiskDetails[],
  body: NewRisk,
  user: User,
  d: Dictionaries,
  now: string,
): RiskDetails {
  const next = Math.max(...all.map((r) => Number(r.id.slice(2)))) + 1;
  const process = d.processes.find((p) => p.name === body.process)!;
  const by = shortName(user.fullName);
  return {
    id: 'R-' + String(next).padStart(4, '0'),
    iso: '—',
    name: body.name.trim(),
    description: body.description.trim(),
    hazard: body.hazard,
    category: body.category,
    process: process.name,
    directorate: process.directorate,
    owner: process.owner,
    asset: body.asset || null,
    createdAt: now.slice(0, 10),
    createdAtTime: now,
    likelihood: null,
    impact: null,
    status: 'DRAFT',
    top: body.top,
    author: by,
    authorPosition: roleOf(user),
    secondary: [],
    responseMode: null,
    modeAt: null,
    assessment: null,
    previous: null,
    measures: [],
    history: [
      {
        at: now,
        text: `Риск зарегистрирован в статусе «Черновик»${body.top ? ' и отмечен как топ-риск' : ''}`,
        by,
        role: roleOf(user),
        kind: 'create',
      },
    ],
    comments: [],
    related: [],
  };
}

/** Registry row without the card-only fields. */
export function toRisk(r: RiskDetails): Risk {
  const {
    id,
    iso,
    name,
    description,
    hazard,
    category,
    process,
    directorate,
    owner,
    asset,
    createdAt,
    likelihood,
    impact,
    status,
    top,
  } = r;
  return {
    id,
    iso,
    name,
    description,
    hazard,
    category,
    process,
    directorate,
    owner,
    asset,
    createdAt,
    likelihood,
    impact,
    status,
    top,
  };
}

/** Card with related risks: same asset, process or hazard (rule from the prototype; ТЗ has none). */
export function riskCard(all: RiskDetails[], id: string): RiskDetails | null {
  const r = all.find((x) => x.id === id);
  if (!r) return null;
  const related = all
    .filter(
      (x) =>
        x.id !== r.id &&
        x.status !== 'CLOSED' &&
        ((r.asset && x.asset === r.asset) || x.process === r.process || x.hazard === r.hazard),
    )
    .slice(0, 5)
    .map(toRisk);
  return { ...r, related };
}

const event = (r: RiskDetails, user: User, now: string, text: string, kind: HistoryEvent['kind']) =>
  r.history.unshift({ at: now, text, by: shortName(user.fullName), role: roleOf(user), kind });

/** UC-2-04 and reassessment: a new assessment version makes the risk active. Returns an error or null. */
export function assess(
  r: RiskDetails,
  input: AssessmentInput,
  user: User,
  d: Dictionaries,
  now: string,
): string | null {
  const gate = canAssess(r, user, d);
  if (!gate.ok) return gate.why;
  if (!Number.isInteger(input.likelihood) || input.likelihood < 0 || input.likelihood > 5)
    return 'Выберите вероятность от 0 до 5';
  const cost = r.asset
    ? (d.assets.find((a) => a.name === r.asset)?.hourlyDowntimeCost ?? null)
    : null;
  if (r.asset && !cost) return 'Расчёт недоступен: у объекта не указана стоимость простоя';
  const values = [input.lossAmount, input.weeks, input.days, input.hours].filter((v) => v != null);
  if (values.some((v) => v! < 0 || !Number.isFinite(v)))
    return 'Значения не могут быть отрицательными';
  const { hours, loss } = lossOf(input, cost);
  const impact = impactOf(loss, d.impactThresholds);
  const score = input.likelihood * impact;
  const first = r.status === 'DRAFT';
  r.assessment = {
    likelihood: input.likelihood,
    impact,
    score,
    lossAmount: loss,
    hourlyCost: cost,
    downtimeHours: hours,
    by: shortName(user.fullName),
    byRole: roleOf(user),
    at: now,
  };
  r.previous = null;
  r.likelihood = input.likelihood;
  r.impact = impact;
  r.status = 'ACTIVE';
  r.responseMode = null;
  r.modeAt = null;
  event(
    r,
    user,
    now,
    `${first ? 'Первичная оценка' : 'Переоценка'}: сумма последствий ${money(loss)}, тяжесть ${impact}, R = ${input.likelihood} × ${impact} = ${score}. Статус «Активен»`,
    'assess',
  );
  return null;
}

export function chooseMode(
  r: RiskDetails,
  mode: ResponseMode,
  user: User,
  d: Dictionaries,
  now: string,
): string | null {
  const gate =
    mode === 'accept' ? canAccept(r, user, d) : mode === 'treat' ? canTreat(r, user, d) : null;
  if (!gate) return 'Режим пока не поддерживается';
  if (!gate.ok) return gate.why;
  r.responseMode = mode;
  r.modeAt = now;
  if (mode === 'accept') r.status = 'ACCEPTED';
  const level = levelOf(r.assessment!.score, d.thresholds);
  event(
    r,
    user,
    now,
    mode === 'accept'
      ? `Риск принят на уровне ${level}, R = ${r.assessment!.score}. Статус «Принят»`
      : `Выбран режим «Обработать»${level === 'TREATMENT_REQUIRED' ? ': риск уровня TREATMENT_REQUIRED принять нельзя' : ''}`,
    'mode',
  );
  return null;
}

export function addComment(r: RiskDetails, text: string, user: User, now: string): string | null {
  const gate = canComment(user);
  if (!gate.ok) return gate.why;
  if (!text.trim()) return 'Введите текст комментария';
  if (text.length > 2000) return 'Комментарий не длиннее 2000 символов';
  r.comments.push({
    id: `C-${r.id}-${Date.now()}`,
    authorId: user.id,
    author: shortName(user.fullName),
    role: roleOf(user),
    at: now,
    text: text.trim(),
  });
  return null;
}

export function addMeasure(
  all: RiskDetails[],
  r: RiskDetails,
  body: NewMeasure,
  user: User,
  now: string,
): string | null {
  const gate = canCreateMeasure(r, user);
  if (!gate.ok) return gate.why;
  if (!body.title.trim() || !body.dueDate || !(body.costPlanned >= 0))
    return 'Заполните обязательные поля';
  const processes = [r.process, ...r.secondary.map((p) => p.name)];
  if (!processes.includes(body.process)) return 'Выберите процесс, связанный с риском';
  const next = Math.max(0, ...all.flatMap((x) => x.measures.map((m) => Number(m.id.slice(2))))) + 1;
  const id = 'М-' + String(next).padStart(4, '0');
  r.measures.unshift({
    id,
    title: body.title.trim(),
    description: body.description.trim(),
    status: 'DRAFT',
    process: body.process,
    dueDate: body.dueDate,
    costPlanned: body.costPlanned,
    costActual: null,
    executor: null,
    sentAt: null,
    decidedAt: null,
    doneAt: null,
  });
  event(r, user, now, `Создана мера ${id} «${body.title.trim()}» в статусе «Черновик»`, 'measure');
  return null;
}

export function toCsv(list: Risk[]): string {
  const head = [
    'ID',
    'ISO',
    'Название',
    'Опасность',
    'Категория',
    'Процесс',
    'Дирекция',
    'Владелец',
    'Объект',
    'Вероятность',
    'Тяжесть',
    'Оценка',
    'Статус',
    'Создан',
  ];
  const cell = (v: unknown) => `"${String(v ?? '—').replaceAll('"', '""')}"`;
  const rows = list.map((r) =>
    [
      r.id,
      r.iso,
      r.name,
      r.hazard,
      r.category,
      r.process,
      r.directorate,
      r.owner,
      r.asset,
      r.likelihood,
      r.impact,
      score(r) || null,
      RISK_STATUS_NAMES[r.status],
      r.createdAt,
    ]
      .map(cell)
      .join(';'),
  );
  // BOM so Excel opens Cyrillic correctly.
  return '﻿' + [head.map(cell).join(';'), ...rows].join('\r\n');
}
