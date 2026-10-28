import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, filter, firstValueFrom, from, map } from 'rxjs';
import { API } from '../api';
import {
  AdminUser,
  AssessmentInput,
  Dictionaries,
  ImportRecord,
  ImportResult,
  ImportType,
  MeasureActionInput,
  NewMeasure,
  NewRisk,
  NewUser,
  Period,
  ReportRecord,
  ModeInput,
  ResponseMode,
  RiskDetails,
  Role,
  RolesState,
} from '../models';
import { blockReason, importTemplate, withRights } from '../mock/admin';
import { archivePage, parseArchiveQuery } from '../mock/archive';
import { dashboard } from '../mock/dashboard';
import { approvalsFor, pageMeasures, parseMeasureQuery } from '../mock/measures';
import { reports } from '../mock/reports';
import {
  filterRisks,
  pageRisks,
  parseQuery,
  riskCard,
  shortName,
  toCsv,
  toRisk,
} from '../mock/risks';
import {
  CommentDto,
  Raw,
  Snapshot,
  backendId,
  build,
  claims,
  rightDefs,
  riskId,
  userId,
  RiskDetailsDto,
  fromDetails,
} from './snapshot';

/** Real API prefix; the dev server proxies it to the stand (proxy.conf.json). */
const V1 = '/v1';
// ponytail: the stand has a single assessment method; take its id from the API once it is exposed.
const METHOD_ID = 1;

interface Ctx {
  req: HttpRequest<unknown>;
  next: HttpHandlerFn;
}
type Handler = (c: Ctx, params: string[]) => Promise<unknown>;

const fail = (status: number, message: string): never => {
  throw new HttpErrorResponse({ status, statusText: message, error: { message } });
};

/** Backend errors come as {message} or ProblemDetails; the UI reads `error.message`. */
function normalize(e: unknown, path: string): never {
  if (!(e instanceof HttpErrorResponse)) throw e;
  const body = (e.error ?? {}) as { message?: string; detail?: string; title?: string };
  const message =
    body.message ||
    body.detail ||
    (e.status === 401
      ? 'Сессия истекла, войдите снова'
      : e.status === 403
        ? 'Недостаточно прав для этого действия'
        : e.status >= 500
          ? `Ошибка сервера (${e.status}) на ${path}. Повторите позже.`
          : body.title) ||
    `Ошибка ${e.status}`;
  throw new HttpErrorResponse({ status: e.status, error: { message }, url: e.url ?? undefined });
}

async function call<T>(c: Ctx, method: string, path: string, body: unknown = null): Promise<T> {
  try {
    const res = await firstValueFrom(
      c
        .next(new HttpRequest(method, `${V1}/${path}`, body, { headers: c.req.headers }))
        .pipe(filter((e): e is HttpResponse<T> => e instanceof HttpResponse)),
    );
    return res.body as T;
  } catch (e) {
    return normalize(e, path);
  }
}

/** Reads that the current user may not have access to yet fall back to a default. */
const opt = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

const tokenOf = (req: HttpRequest<unknown>) =>
  req.headers.get('Authorization')?.replace('Bearer ', '') ?? fail(401, 'Сессия истекла');

async function load(c: Ctx): Promise<Snapshot> {
  const token = tokenOf(c.req);
  const failed: Record<string, string> = {};
  const get = <T>(path: string, fallback: T) =>
    call<T>(c, 'GET', path).catch((e: HttpErrorResponse) => {
      failed[path] = (e.error as { message?: string })?.message ?? e.message;
      return fallback;
    });
  const [
    users,
    roles,
    rights,
    directorates,
    processes,
    persons,
    assets,
    categories,
    hazards,
    hazardGroups,
    impact,
    acceptance,
    approval,
    risks,
    treatments,
    approvals,
    likelihood,
  ] = await Promise.all([
    get<Raw['users']>('users', []),
    get<Raw['roles']>('roles', []),
    get<Raw['rights']>('rights', []),
    get<Raw['directorates']>('org/directorates', []),
    get<Raw['processes']>('org/processes', []),
    get<Raw['persons']>('org/persons', []),
    get<Raw['assets']>('org/assets', []),
    get<Raw['categories']>('risk/categories', []),
    get<Raw['hazards']>('risk/hazards', []),
    get<Raw['hazardGroups']>('risk/hazard-groups', []),
    get<Raw['impact']>(`assessment/impact-levels?methodId=${METHOD_ID}`, []),
    get<Raw['acceptance']>(`assessment/acceptance-settings?methodId=${METHOD_ID}`, null),
    get<Raw['approval']>('treatment/approval-settings', null),
    get<Raw['risks']>('risks', []),
    get<Raw['treatments']>('treatments', []),
    get<Raw['approvals']>('approval-requests', []),
    get<Raw['likelihood']>(`assessment/likelihood-levels?methodId=${METHOD_ID}`, []),
  ]);
  const roleRights = Object.fromEntries(
    await Promise.all(
      roles.map(async (r) => [
        r.roleId,
        (await get<Raw['rights']>(`roles/rights?roleId=${r.roleId}`, [])).map((x) => x.rightCode),
      ]),
    ),
  );
  // Own profile: admins see it in the list, others may still read their own card.
  const me = claims(token).id;
  if (!users.some((u) => u.userId === me)) {
    const own = await get<Raw['users'][number] | null>(`users/${me}`, null);
    if (own) users.push(own);
  }
  return build(
    {
      users,
      roles,
      rights,
      roleRights,
      directorates,
      processes,
      persons,
      assets,
      categories,
      hazards,
      hazardGroups,
      impact,
      acceptance,
      approval,
      risks,
      treatments,
      approvals,
      likelihood,
      failed,
    },
    token,
  );
}

// One snapshot serves the burst of requests a screen makes; any write drops it.
let cache: { token: string; at: number; snap: Promise<Snapshot> } | null = null;
function snapshot(c: Ctx): Promise<Snapshot> {
  const token = tokenOf(c.req);
  if (!cache || cache.token !== token || Date.now() - cache.at > 15_000) {
    const snap = load(c);
    cache = { token, at: Date.now(), snap };
    snap.catch(() => (cache = null));
  }
  return cache.snap;
}
const invalidate = () => (cache = null);

/** A screen's main list failed to load: show the server error instead of an empty list. */
function needs(s: Snapshot, path: string): Snapshot {
  const why = s.raw.failed[path];
  return why ? fail(502, `Сервер не отдал данные (${path}): ${why}`) : s;
}

async function admin(c: Ctx): Promise<Snapshot> {
  const s = await snapshot(c);
  return s.me.rights.includes('admin') ? s : fail(403, 'Раздел доступен только администратору');
}

// ── Lookups by the names the UI works with ─────────────────────────────────

function idOf<T>(list: T[], pick: (x: T) => boolean, id: (x: T) => number, what: string): number {
  const x = list.find(pick);
  return x ? id(x) : fail(422, `${what} не найден(а) в справочнике сервера`);
}
const directorateId = (s: Snapshot, name: string) =>
  idOf(
    s.raw.directorates,
    (d) => d.directorateTitle === name,
    (d) => d.directorateId,
    `Дирекция «${name}»`,
  );
const processId = (s: Snapshot, name: string) =>
  idOf(
    s.raw.processes,
    (p) => p.processTitle === name,
    (p) => p.processId,
    `Процесс «${name}»`,
  );
const roleIds = (s: Snapshot, codes: Role[]) =>
  codes.map((code) =>
    idOf(
      s.raw.roles,
      (r) => r.roleCode === code,
      (r) => r.roleId,
      `Роль ${code}`,
    ),
  );

function riskBody(s: Snapshot, body: NewRisk) {
  return {
    riskTitle: body.name.trim(),
    riskDescription: body.description.trim(),
    hazardId: idOf(
      s.raw.hazards,
      (h) => h.hazardName === body.hazard,
      (h) => h.hazardId,
      'Опасность',
    ),
    categoryId: idOf(
      s.raw.categories,
      (x) => x.categoryName === body.category,
      (x) => x.categoryId,
      'Категория',
    ),
    assetId: body.asset
      ? idOf(
          s.raw.assets,
          (a) => a.assetTitle === body.asset,
          (a) => a.assetId,
          'Объект',
        )
      : null,
    processIds: [processId(s, body.process)],
  };
}

/** Treatments hang on a risk–process link; the list row carries the link ids. */
function measureBody(s: Snapshot, riskId: string | undefined, body: NewMeasure) {
  const row = s.raw.risks.find((x) => riskId && x.riskId === backendId(riskId));
  const k = row ? row.processes.indexOf(body.process) : -1;
  return {
    riskProcessId:
      row?.riskProcessIds?.[k] ?? (riskId ? fail(422, `Процесс «${body.process}» не связан с риском`) : undefined),
    treatmentTitle: body.title.trim(),
    treatmentDescription: body.description.trim(),
    dueDate: body.dueDate ? new Date(body.dueDate).toISOString() : null,
    treatmentCostPlan: body.costPlanned,
  };
}

/** Risk card: the list row plus comments, which are the only per-risk read the API has. */
async function card(c: Ctx, id: string) {
  const s = await snapshot(c);
  const r = riskCard(s.state.risks, id) ?? fail(404, 'Риск не найден');
  const [list, details] = await Promise.all([
    opt(call<CommentDto[]>(c, 'GET', `comments?entityType=Risk&entityId=${backendId(id)}`), []),
    opt(call<RiskDetailsDto | null>(c, 'GET', `risks/${backendId(id)}`), null),
  ]);
  if (details) Object.assign(r, fromDetails(details, r.status));
  const author = (n: number) => s.state.users.find((u) => u.id === userId(n));
  r.comments = list
    .filter((x) => x.isActive)
    .map((x) => ({
      id: String(x.commentId),
      authorId: userId(x.authorId),
      author: author(x.authorId)?.fullName ?? '—',
      role: author(x.authorId)?.position ?? '',
      at: x.createdAt,
      text: x.text ?? '',
    }));
  return r;
}

/** Runs a write, then answers with the fresh card. */
async function mutate(c: Ctx, id: string, write: () => Promise<unknown>) {
  await write();
  invalidate();
  return card(c, id);
}

const now = () => new Date().toISOString();
const unsupported = (what: string) =>
  fail(501, `${what}: сервер пока не поддерживает это действие`);

const MEASURE_ENDPOINT: Partial<Record<MeasureActionInput['action'], string>> = {
  send: 'submit-approval',
  start: 'start',
  hold: 'hold',
  resume: 'resume',
  cancel: 'cancel',
};

// ── Dictionaries: the UI sends whole lists, the API takes one entity per call ──

async function saveDictionaries(c: Ctx, s: Snapshot, patch: Partial<Dictionaries>) {
  const d = s.state.dict;
  const added = (next: string[] | undefined, cur: string[]) =>
    (next ?? []).filter((x) => !cur.includes(x));

  for (const name of added(patch.directorates, d.directorates))
    await call(c, 'POST', 'org/directorates', { directorateTitle: name });
  for (const name of added(patch.categories, d.categories))
    await call(c, 'POST', 'risk/categories', { categoryName: name });
  const newHazards = added(patch.hazards, d.hazards);
  if (newHazards.length) {
    // ponytail: the UI has a flat hazard list; new hazards go to the first group (created if none).
    const group =
      s.raw.hazardGroups[0]?.hazardGroupId ??
      (
        await call<{ hazardGroupId: number }>(c, 'POST', 'risk/hazard-groups', {
          hazardGroupName: 'Общие',
        })
      ).hazardGroupId;
    for (const name of newHazards)
      await call(c, 'POST', 'risk/hazards', { hazardGroupId: group, hazardName: name });
  }
  if (patch.disabled) {
    const toggled = [
      ...added(patch.disabled, d.disabled),
      ...d.disabled.filter((x) => !patch.disabled!.includes(x)),
    ];
    for (const name of toggled) {
      const isActive = !patch.disabled.includes(name);
      const cat = s.raw.categories.find((x) => x.categoryName === name);
      const haz = s.raw.hazards.find((x) => x.hazardName === name);
      if (cat) await call(c, 'PUT', `risk/categories/${cat.categoryId}`, { isActive });
      else if (haz) await call(c, 'PUT', `risk/hazards/${haz.hazardId}`, { isActive });
    }
  }
  for (const p of patch.processes ?? []) {
    const cur = s.raw.processes.find((x) => x.processTitle === p.name);
    // Processes are owned by a person card, so the chosen user is translated to it.
    const owner = p.ownerId
      ? (s.raw.persons.find((x) => x.userId === backendId(p.ownerId!) && x.isPersonActive)
          ?.personId ?? fail(422, `У владельца ${p.owner} нет карточки сотрудника на сервере`))
      : null;
    if (!cur) {
      if (!owner) fail(422, 'Сервер создаёт процесс только вместе с владельцем');
      await call(c, 'POST', 'org/processes', {
        directorateId: directorateId(s, p.directorate),
        processTitle: p.name,
        ownerId: owner,
        processDescription: '',
      });
    } else if (owner && owner !== cur.ownerId)
      await call(c, 'PUT', `org/processes/${cur.processId}`, { ownerId: owner });
  }
  for (const a of patch.assets ?? []) {
    const cur = s.raw.assets.find((x) => x.assetTitle === a.name);
    if (!cur)
      await call(c, 'POST', 'org/assets', {
        assetTitle: a.name,
        assetInventoryNum: '',
        assetHourCost: a.hourlyDowntimeCost,
      });
    else if (cur.assetHourCost !== a.hourlyDowntimeCost)
      await call(c, 'PUT', `org/assets/${cur.assetId}`, { assetHourCost: a.hourlyDowntimeCost });
  }
  if (patch.directors) {
    for (const [dir, name] of Object.entries(patch.directors)) {
      if (d.directors[dir] === name || !name) continue;
      const u = s.state.users.find((x) => shortName(x.fullName) === name);
      const person = s.raw.persons.find(
        (p) => u && p.userId === backendId(u.id) && p.isPersonActive,
      );
      if (!person) fail(422, `У пользователя ${name} нет карточки сотрудника на сервере`);
      if (person!.directorateId !== directorateId(s, dir))
        fail(422, `${name} числится в другой дирекции: директор назначается внутри своей`);
      // The directorate comes from the person card; directedId links persons, not directorates.
      await call(c, 'POST', 'org/responsibilities', {
        personId: person!.personId,
        directedId: null,
        responsibilityType: 'DIRECTOR',
      });
    }
  }
  if (patch.thresholds)
    await call(c, 'POST', 'assessment/acceptance-settings', {
      methodId: METHOD_ID,
      ownerMaxScore: patch.thresholds.owner,
      directorMaxScore: patch.thresholds.director,
      ceoMaxScore: patch.thresholds.ceo,
    });
  if (patch.approval)
    await call(c, 'POST', 'treatment/approval-settings', {
      ownerThreshold: patch.approval.owner,
      directorThreshold: patch.approval.director,
      ceoThreshold: patch.approval.ceo,
    });
  if (patch.impactThresholds) {
    const levels = [...s.raw.impact].sort((a, b) => a.impactLevelWeight - b.impactLevelWeight);
    if (levels.length !== 6) fail(422, 'На сервере не настроены уровни последствий метода оценки');
    const b = [0, ...patch.impactThresholds];
    await call(c, 'POST', 'assessment/impact-levels', {
      methodId: METHOD_ID,
      levels: levels.map((l, k) => ({
        impactLevelId: l.impactLevelId,
        impactLevelLoss: b[k],
        // Upper bounds are inclusive and must stay below the next level's lower bound.
        impactLevelMax: k < 5 ? b[k + 1] - 0.01 : l.impactLevelMax,
      })),
    });
  }
}

// ── Users ──────────────────────────────────────────────────────────────────

async function savePerson(c: Ctx, s: Snapshot, uid: number, position?: string, dir?: string) {
  if (position === undefined && dir === undefined) return;
  const person = s.raw.persons.find((p) => p.userId === uid && p.isPersonActive);
  const directorate = dir ? directorateId(s, dir) : undefined;
  if (person)
    await call(c, 'PUT', `org/persons/${person.personId}`, {
      personPosition: position,
      directorateId: directorate,
    });
  else if (directorate)
    await call(c, 'POST', 'org/persons', {
      userId: uid,
      directorateId: directorate,
      personPosition: position ?? '',
    });
}

/**
 * Creates the account. `responsibilityType` on the server only takes CEO/DIRECTOR/RISK_SPECIALIST,
 * so the position goes to the person card the server creates for the directorate.
 */
async function createUser(c: Ctx, s: Snapshot, body: NewUser): Promise<number> {
  const { userId: id } = await call<{ userId: number }>(c, 'POST', 'users', {
    userFio: body.fullName.trim(),
    userEmail: body.email.trim(),
    roleIds: roleIds(s, body.roles),
    directorateId: body.directorate ? directorateId(s, body.directorate) : null,
  });
  const position = body.position?.trim();
  if (position && body.directorate) {
    const { personId } = await call<{ personId: number | null }>(c, 'GET', `users/${id}`);
    if (personId) await call(c, 'PUT', `org/persons/${personId}`, { personPosition: position });
  }
  return id;
}

// ── Import: the upload API takes no file content yet, so rows go one by one ──

const IMPORT_ROW: Record<ImportType, (c: Ctx, s: Snapshot, row: string[]) => Promise<unknown>> = {
  assets: (c, _s, [name = '', cost = '']) => {
    const value = Number(cost.replace(/\s/g, '').replace(',', '.'));
    if (!name.trim()) return Promise.reject(new Error('Укажите объект'));
    if (!(value > 0))
      return Promise.reject(new Error('Стоимость часа простоя должна быть больше 0'));
    return call(c, 'POST', 'org/assets', {
      assetTitle: name.trim(),
      assetInventoryNum: '',
      assetHourCost: value,
    });
  },
  users: (c, s, [fullName = '', email = '', position = '', directorate = '', role = '']) =>
    createUser(c, s, {
      fullName,
      email,
      position,
      directorate,
      roles: role.split(/[,;\s]+/).filter(Boolean) as Role[],
    }),
  risks: (c, s, [name = '', description = '', hazard = '', category = '', process = '']) =>
    call(
      c,
      'POST',
      'risks',
      riskBody(s, { name, description, hazard, category, process, asset: '', top: false }),
    ),
};

const imports: ImportRecord[] = [];

async function runImport(c: Ctx, body: { type: ImportType; file: string; rows: string[][] }) {
  const s = await admin(c);
  const errors: ImportResult['errors'] = [];
  for (const [k, row] of body.rows.entries()) {
    try {
      await IMPORT_ROW[body.type](
        c,
        s,
        row.map((x) => x.trim()),
      );
    } catch (e) {
      const message =
        e instanceof HttpErrorResponse
          ? ((e.error as { message?: string })?.message ?? e.message)
          : (e as Error).message;
      errors.push({ row: k + 2, message });
    }
  }
  invalidate();
  const record: ImportRecord = {
    id: `I-${Date.now()}`,
    at: now(),
    by: shortName(s.me.fullName),
    type: body.type,
    file: body.file,
    total: body.rows.length,
    created: body.rows.length - errors.length,
    errors: errors.length,
  };
  imports.unshift(record);
  return { record, errors } satisfies ImportResult;
}

const reportHistory: ReportRecord[] = [];

// ── Routes: the same contract the mock serves ──────────────────────────────

const routes: [string, RegExp, Handler][] = [
  [
    'POST',
    /^auth\/login$/,
    async (c) => {
      const { email, password } = c.req.body as { email: string; password: string };
      let token: string;
      try {
        ({ accessToken: token } = await call<{ accessToken: string }>(c, 'POST', 'auth/login', {
          email: email.trim(),
          password,
        }));
      } catch (e) {
        if (e instanceof HttpErrorResponse && (e.status === 400 || e.status === 401))
          fail(401, 'Неверный логин или пароль');
        throw e;
      }
      invalidate();
      const s = await snapshot({
        ...c,
        req: c.req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
      });
      return { token, user: s.me };
    },
  ],
  ['GET', /^auth\/me$/, async (c) => (await snapshot(c)).me],
  ['POST', /^auth\/logout$/, async () => (invalidate(), null)],
  ['GET', /^dictionaries$/, async (c) => (await snapshot(c)).state.dict],
  [
    'GET',
    /^risks$/,
    async (c) => {
      const s = needs(await snapshot(c), 'risks');
      const page = pageRisks(s.state.risks, parseQuery(c.req.params), s.state.dict);
      return { ...page, items: page.items.map((r) => toRisk(r as RiskDetails)) };
    },
  ],
  [
    'GET',
    /^risks\/export$/,
    async (c) => {
      const s = await snapshot(c);
      const ids = c.req.params.get('ids')?.split(',');
      const list = ids
        ? s.state.risks.filter((r) => ids.includes(r.id))
        : filterRisks(s.state.risks, parseQuery(c.req.params), s.state.dict);
      return new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' });
    },
  ],
  [
    'POST',
    /^risks$/,
    async (c) => {
      const s = await snapshot(c);
      const { riskId: n } = await call<{ riskId: number }>(
        c,
        'POST',
        'risks',
        riskBody(s, c.req.body as NewRisk),
      );
      invalidate();
      const fresh = (await snapshot(c)).state.risks.find((r) => r.id === riskId(n));
      return fresh ? toRisk(fresh) : { ...(c.req.body as NewRisk), id: riskId(n), status: 'DRAFT' };
    },
  ],
  ['GET', /^risks\/(R-\d+)$/, (c, [id]) => card(c, id)],
  [
    'PATCH',
    /^risks\/(R-\d+)$/,
    async (c, [id]) => {
      const s = await snapshot(c);
      return mutate(c, id, () =>
        call(c, 'PUT', `risks/${backendId(id)}`, riskBody(s, c.req.body as NewRisk)),
      );
    },
  ],
  [
    'POST',
    /^risks\/(R-\d+)\/assessments$/,
    async (c, [id]) => {
      const s = await snapshot(c);
      const r = s.state.risks.find((x) => x.id === id) ?? fail(404, 'Риск не найден');
      const input = c.req.body as AssessmentInput;
      return mutate(c, id, () =>
        call(
          c,
          'POST',
          `risks/${backendId(id)}/${r.status === 'REASSESSMENT' ? 'reassess' : 'assess'}`,
          {
            likelihoodLevelId:
              s.raw.likelihood.find((l) => l.likelihoodLevelWeight === input.likelihood)
                ?.likelihoodLevelId ?? fail(422, 'На сервере нет такого уровня вероятности'),
            lossAmount: input.lossAmount ?? 0,
            downtimeWeeks: input.weeks ?? null,
            downtimeDays: input.days ?? null,
            downtimeHours: input.hours ?? null,
          },
        ),
      );
    },
  ],
  [
    'POST',
    /^risks\/(R-\d+)\/mode$/,
    async (c, [id]) => {
      const input = c.req.body as ModeInput;
      const s = await snapshot(c);
      const n = backendId(id);
      return mutate(c, id, () =>
        input.mode === 'split'
          ? call(c, 'POST', `risks/${n}/split`, {
              processIds: (input.processes ?? []).map((p) => processId(s, p)),
              primaryProcessId: processId(s, input.primary ?? ''),
            })
          : input.mode === 'transfer'
            ? call(c, 'POST', `risks/${n}/transfer`, { newProcessId: processId(s, input.process ?? '') })
            : call(c, 'POST', `risks/${n}/${input.mode}`),
      );
    },
  ],
  [
    'POST',
    /^risks\/(R-\d+)\/comments$/,
    (c, [id]) =>
      mutate(c, id, () =>
        call(c, 'POST', 'comments', {
          commentEntityType: 'Risk',
          commentEntityId: backendId(id),
          commentText: (c.req.body as { text: string }).text.trim(),
        }),
      ),
  ],
  [
    'POST',
    /^risks\/(R-\d+)\/measures$/,
    async (c, [id]) => {
      const s = await snapshot(c);
      return mutate(c, id, () =>
        call(c, 'POST', 'treatments', measureBody(s, id, c.req.body as NewMeasure)),
      );
    },
  ],
  [
    'POST',
    /^risks\/(R-\d+)\/close$/,
    (c, [id]) => {
      const { reason, comment } = c.req.body as { reason: string; comment?: string };
      return mutate(c, id, () =>
        call(c, 'POST', `risks/${backendId(id)}/close`, {
          closeReason: comment?.trim() ? `${reason}: ${comment.trim()}` : reason,
        }),
      );
    },
  ],
  [
    'POST',
    /^risks\/(R-\d+)\/reopen$/,
    (c, [id]) => mutate(c, id, () => call(c, 'POST', `risks/${backendId(id)}/reset-reassessment`)),
  ],
  [
    'GET',
    /^measures$/,
    async (c) => {
      const s = await snapshot(c);
      return pageMeasures(s.state.risks, parseMeasureQuery(c.req.params), s.me, s.state.dict);
    },
  ],
  [
    'PATCH',
    /^measures\/(М-\d+)$/,
    async (c, [mid]) => {
      const s = await snapshot(c);
      const owner = s.state.risks.find((r) => r.measures.some((m) => m.id === mid));
      const write = () =>
        call(c, 'PUT', `treatments/${backendId(mid)}`, measureBody(s, owner?.id, c.req.body as NewMeasure));
      return owner ? mutate(c, owner.id, write) : (await write(), invalidate(), null);
    },
  ],
  [
    'POST',
    /^measures\/(М-\d+)\/actions$/,
    async (c, [mid]) => {
      const s = await snapshot(c);
      const input = c.req.body as MeasureActionInput;
      const n = backendId(mid);
      const owner = s.state.risks.find((r) => r.measures.some((m) => m.id === mid));
      const write = (): Promise<unknown> => {
        const simple = MEASURE_ENDPOINT[input.action];
        if (simple) return call(c, 'POST', `treatments/${n}/${simple}`);
        switch (input.action) {
          case 'handover': {
            const u = s.state.users.find((x) => shortName(x.fullName) === input.executor);
            return call(c, 'POST', `treatments/${n}/execute`, {
              assigneeId: u ? backendId(u.id) : fail(422, 'Исполнитель не найден'),
            });
          }
          case 'finish':
            return call(c, 'POST', `treatments/${n}/complete`, {
              treatmentCostAct: input.costActual ?? 0,
            });
          case 'approve':
          case 'reject':
          case 'revoke': {
            const req =
              s.raw.treatments.find((t) => t.treatmentId === n)?.approvalRequestId ??
              fail(409, 'У меры нет запроса согласования');
            const reason = input.reason?.trim() || null;
            const body =
              input.action === 'approve'
                ? { approvalComment: reason }
                : input.action === 'reject'
                  ? { approvalReason: reason }
                  : { revokeReason: reason };
            return call(c, 'POST', `approval-requests/${req}/${input.action}`, body);
          }
          default:
            return unsupported('Действие с мерой');
        }
      };
      if (!owner) {
        await write();
        invalidate();
        return null;
      }
      return mutate(c, owner.id, write);
    },
  ],
  [
    'GET',
    /^dashboard$/,
    async (c) => {
      const s = await snapshot(c);
      const dirs = c.req.params.get('directorates')?.split(',');
      const scope = dirs
        ? s.state.risks.filter((r) => dirs.includes(r.directorate))
        : s.state.risks;
      return dashboard(scope, (c.req.params.get('period') as Period) || 'quarter', s.state.dict);
    },
  ],
  [
    'GET',
    /^archive$/,
    async (c) => archivePage((await snapshot(c)).state.risks, parseArchiveQuery(c.req.params)),
  ],
  [
    'GET',
    /^reports$/,
    async (c) => {
      const s = await snapshot(c);
      return reports(s.state.risks, s.me, s.state.dict);
    },
  ],
  ['GET', /^reports\/history$/, async () => reportHistory],
  [
    'POST',
    /^reports\/history$/,
    async (c) => {
      const s = await snapshot(c);
      const record: ReportRecord = {
        ...(c.req.body as Pick<ReportRecord, 'title' | 'template' | 'format'>),
        id: `H-${Date.now()}`,
        at: now(),
        by: shortName(s.me.fullName),
        status: 'READY',
      };
      reportHistory.unshift(record);
      return record;
    },
  ],
  [
    'GET',
    /^approvals$/,
    async (c) => {
      const s = await snapshot(c);
      return approvalsFor(s.state.risks, s.me, s.state.dict);
    },
  ],
  // ── Administration ──
  [
    'GET',
    /^admin\/users$/,
    async (c) => {
      const s = needs(await admin(c), 'users');
      return s.state.users.map((u) => ({
        ...withRights(u, s.state),
        blockReason: blockReason(s.state, u),
      }));
    },
  ],
  [
    'POST',
    /^admin\/users$/,
    async (c) => {
      const s = await admin(c);
      const id = await createUser(c, s, c.req.body as NewUser);
      // The server keeps the generated password to itself and emails nothing yet; a reset issues one to show.
      const { temporaryPassword } = await call<{ temporaryPassword: string }>(
        c,
        'POST',
        `users/${id}/reset-password`,
      );
      invalidate();
      const user = (await snapshot(c)).state.users.find((u) => u.id === userId(id));
      return { ...user, temporaryPassword };
    },
  ],
  [
    'PATCH',
    /^admin\/users\/(U-\d+)$/,
    async (c, [id]) => {
      const s = await admin(c);
      const u = s.state.users.find((x) => x.id === id) ?? fail(404, 'Пользователь не найден');
      const patch = c.req.body as Partial<AdminUser>;
      if (patch.blocked) {
        const why = blockReason(s.state, u);
        if (why) fail(422, why);
      }
      const n = backendId(id);
      if (patch.fullName !== undefined || patch.roles || patch.blocked !== undefined)
        await call(c, 'PUT', `users/${n}`, {
          userFio: (patch.fullName ?? u.fullName).trim(),
          roleIds: roleIds(s, patch.roles ?? u.roles),
          isUserActive: !(patch.blocked ?? u.blocked),
        });
      await savePerson(c, s, n, patch.position, patch.directorate ?? undefined);
      invalidate();
      return (await snapshot(c)).state.users.find((x) => x.id === id);
    },
  ],
  [
    'GET',
    /^admin\/roles$/,
    async (c) => {
      const s = await admin(c);
      return {
        roles: s.state.roles,
        rights: rightDefs(s.raw),
        matrix: Object.fromEntries(
          s.raw.roles.map((r) => [r.roleCode, s.raw.roleRights[r.roleId] ?? []]),
        ),
      } as RolesState;
    },
  ],
  [
    'PUT',
    /^admin\/roles$/,
    async (c) => {
      const s = await admin(c);
      const body = c.req.body as {
        matrix: Record<string, string[]>;
        active: Partial<Record<Role, boolean>>;
      };
      const switched = Object.entries(body.active).some(
        ([code, on]) => s.state.roles.find((r) => r.code === code)?.active !== on,
      );
      if (switched) unsupported('Включение и выключение ролей');
      for (const r of s.raw.roles) {
        const next = body.matrix[r.roleCode];
        const cur = s.raw.roleRights[r.roleId] ?? [];
        if (!next || r.roleCode === 'ADMIN' || [...next].sort().join() === [...cur].sort().join())
          continue;
        await call(c, 'PUT', `roles/${r.roleId}/rights`, {
          rightIds: next.map((code) => s.raw.rights.find((x) => x.rightCode === code)!.rightId),
        });
      }
      invalidate();
      const fresh = await admin(c);
      return {
        roles: fresh.state.roles,
        rights: rightDefs(fresh.raw),
        matrix: Object.fromEntries(
          fresh.raw.roles.map((r) => [r.roleCode, fresh.raw.roleRights[r.roleId] ?? []]),
        ),
      } as RolesState;
    },
  ],
  [
    'PATCH',
    /^admin\/dictionaries$/,
    async (c) => {
      const s = await admin(c);
      await saveDictionaries(c, s, c.req.body as Partial<Dictionaries>);
      invalidate();
      return (await snapshot(c)).state.dict;
    },
  ],
  // ponytail: no audit endpoint on the server yet, so the settings log stays empty.
  ['GET', /^admin\/changes$/, async (c) => (await admin(c), [])],
  ['GET', /^admin\/imports$/, async (c) => (await admin(c), imports)],
  [
    'GET',
    /^admin\/imports\/template$/,
    async (c) => importTemplate(c.req.params.get('type') as ImportType),
  ],
  [
    'POST',
    /^admin\/imports$/,
    (c) => runImport(c, c.req.body as { type: ImportType; file: string; rows: string[][] }),
  ],
];

/** Serves the UI's API contract from the real backend (/v1), translating ids, names and DTOs. */
export const backendApi: HttpInterceptorFn = (req, next): Observable<HttpEvent<unknown>> => {
  if (!req.url.startsWith(API + '/')) return next(req);
  const path = req.url.slice(API.length + 1).split('?')[0];
  for (const [method, pattern, handler] of routes) {
    const match = method === req.method && pattern.exec(path);
    if (!match) continue;
    return from(
      (async () => {
        try {
          return await handler({ req, next }, match.slice(1));
        } catch (e) {
          if (e instanceof HttpErrorResponse && e.status === 401 && path !== 'auth/login')
            invalidate();
          throw e;
        }
      })(),
    ).pipe(map((body) => new HttpResponse({ status: 200, body })));
  }
  return from(Promise.reject(new HttpErrorResponse({ status: 404, url: req.url })));
};
