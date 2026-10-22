import {
  AdminUser,
  Dictionaries,
  ImportRecord,
  ImportResult,
  ImportType,
  NewUser,
  Right,
  RiskDetails,
  Role,
  RoleDef,
  RolesState,
  SettingsChange,
  User,
} from '../models';
import { impactOf } from '../risk-rules';
import { RIGHT_DEFS, rightsOf } from './db';
import { shortName } from './risks';

/** Everything the in-memory backend keeps between page loads. */
export interface MockState {
  risks: RiskDetails[];
  users: AdminUser[];
  dict: Dictionaries;
  roles: RoleDef[];
  matrix: Record<Role, Right[]>;
  imports: ImportRecord[];
  changes: SettingsChange[];
}

export const withRights = (u: AdminUser, s: MockState): AdminUser => ({
  ...u,
  rights: rightsOf(u.roles, s.matrix, s.roles),
});

const log = (s: MockState, by: User, what: string, now: string) =>
  s.changes.unshift({ at: now, by: shortName(by.fullName), what });

// ── Users (analytics 05) ─────────────────────────────────────────────────────

export function createUser(s: MockState, body: NewUser, by: User, now: string): AdminUser | string {
  const email = body.email.trim().toLowerCase();
  if (body.fullName.trim().split(/\s+/).length < 2) return 'Укажите фамилию и имя';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Проверьте формат email';
  if (s.users.some((u) => u.email.toLowerCase() === email))
    return 'Пользователь с таким email уже есть';
  if (!body.roles.length) return 'Назначьте хотя бы одну роль';
  const next = Math.max(...s.users.map((u) => Number(u.id.slice(2)))) + 1;
  const user: AdminUser = {
    id: 'U-' + String(next).padStart(3, '0'),
    fullName: body.fullName.trim().replace(/\s+/g, ' '),
    email,
    position: body.position.trim(),
    roles: body.roles,
    rights: [],
    directorate: body.directorate || null,
    blocked: false,
    createdAt: now.slice(0, 10),
  };
  s.users.push(user);
  log(
    s,
    by,
    `Создан пользователь ${user.fullName} (${user.email}), письмо с временным паролем отправлено`,
    now,
  );
  return user;
}

/** Why the user cannot be blocked, or null (analytics 05: owners and the last admin stay active). */
export function blockReason(s: MockState, u: AdminUser): string | null {
  if (s.dict.processes.some((p) => p.ownerId === u.id))
    return 'Пользователь владеет процессом. Сначала назначьте процессу другого владельца.';
  if (
    u.roles.includes('ADMIN') &&
    s.users.filter((x) => !x.blocked && x.roles.includes('ADMIN')).length <= 1
  )
    return 'Нельзя заблокировать последнего активного администратора.';
  return null;
}

export function updateUser(
  s: MockState,
  id: string,
  patch: Partial<Pick<AdminUser, 'fullName' | 'roles' | 'blocked' | 'position' | 'directorate'>>,
  by: User,
  now: string,
): AdminUser | string {
  const u = s.users.find((x) => x.id === id);
  if (!u) return 'Пользователь не найден';
  if (patch.blocked === true && !u.blocked) {
    const why = blockReason(s, u);
    if (why) return why;
  }
  if (patch.roles) {
    if (!patch.roles.length) return 'У активного пользователя должна быть хотя бы одна роль';
    if (
      u.roles.includes('ADMIN') &&
      !patch.roles.includes('ADMIN') &&
      s.users.filter((x) => !x.blocked && x.roles.includes('ADMIN')).length <= 1
    )
      return 'Нельзя снять роль ADMIN с последнего администратора';
  }
  if (patch.fullName !== undefined && patch.fullName.trim().split(/\s+/).length < 2)
    return 'Укажите фамилию и имя';
  Object.assign(u, patch, patch.fullName ? { fullName: patch.fullName.trim() } : {});
  const what =
    patch.blocked !== undefined
      ? `${u.fullName} ${patch.blocked ? 'заблокирован' : 'разблокирован'}`
      : patch.roles
        ? `Роли ${u.fullName}: ${patch.roles.join(', ')}`
        : `Изменены данные ${u.fullName}`;
  log(s, by, what, now);
  return u;
}

// ── Roles and rights (analytics 03) ──────────────────────────────────────────

export function rolesState(s: MockState): RolesState {
  return { roles: s.roles, rights: RIGHT_DEFS, matrix: s.matrix };
}

export function saveRoles(
  s: MockState,
  body: { matrix: Record<Role, Right[]>; active: Partial<Record<Role, boolean>> },
  by: User,
  now: string,
): RolesState | string {
  // ADMIN keeps its single right and cannot be switched off (rules 16–17).
  if (body.active.ADMIN === false) return 'Роль ADMIN нельзя деактивировать';
  if (body.matrix.ADMIN.join() !== 'admin') return 'Связь ADMIN → admin нельзя изменить';
  for (const [code, on] of Object.entries(body.active) as [Role, boolean][]) {
    if (on) continue;
    // A user must keep at least one active role (rule 9).
    const stranded = s.users.find(
      (u) =>
        !u.blocked &&
        u.roles.includes(code) &&
        !u.roles.some(
          (r) =>
            r !== code && body.active[r] !== false && s.roles.find((x) => x.code === r)?.active,
        ),
    );
    if (stranded)
      return `Нельзя выключить ${code}: у ${stranded.fullName} не останется активных ролей`;
  }
  s.matrix = body.matrix;
  s.roles = s.roles.map((r) => ({ ...r, active: body.active[r.code] ?? r.active }));
  log(s, by, 'Изменена матрица прав ролей', now);
  return rolesState(s);
}

// ── Dictionaries, methodology and thresholds (analytics 06, 07, 10, 13) ──────

export function updateDictionaries(
  s: MockState,
  patch: Partial<Dictionaries> & { recalc?: boolean },
  by: User,
  now: string,
): Dictionaries | string {
  const { recalc, ...dict } = patch;
  if (dict.thresholds) {
    const t = dict.thresholds;
    if (!(0 <= t.owner && t.owner < t.director && t.director < t.ceo && t.ceo < 25))
      return 'Пороги должны строго возрастать: 0 ≤ OWNER < DIRECTOR < CEO < 25';
  }
  if (dict.approval) {
    const t = dict.approval;
    if (!(0 <= t.owner && t.owner < t.director && t.director < t.ceo))
      return 'Пороги согласования должны строго возрастать: 0 ≤ OWNER < DIRECTOR < CEO';
  }
  if (dict.impactThresholds) {
    const t = dict.impactThresholds;
    if (t.some((v, k) => v < 0 || (k > 0 && v <= t[k - 1])))
      return 'Пороги тяжести должны строго возрастать и быть не меньше 0';
  }
  if (dict.assets?.some((a) => !(a.hourlyDowntimeCost > 0)))
    return 'У объекта должна быть стоимость часа простоя больше 0';
  for (const key of ['hazards', 'categories', 'directorates'] as const) {
    const list = dict[key];
    if (list && new Set(list.map((x) => x.trim().toLowerCase())).size !== list.length)
      return 'Названия в справочнике должны быть уникальными';
  }

  const assetCostChanged = dict.assets?.filter(
    (a) =>
      s.dict.assets.find((x) => x.name === a.name)?.hourlyDowntimeCost !== a.hourlyDowntimeCost,
  );
  Object.assign(s.dict, dict);

  // Technical versions of current assessments: new impact for money thresholds or asset cost (analytics 09, rule 26).
  let changed = 0;
  if (recalc || assetCostChanged?.length) {
    for (const r of s.risks) {
      const a = r.assessment;
      if (!a || r.status === 'ACCEPTED' || r.status === 'CLOSED') continue;
      const asset = assetCostChanged?.find((x) => x.name === r.asset);
      const cost = asset ? asset.hourlyDowntimeCost : a.hourlyCost;
      const loss =
        cost && a.downtimeHours != null
          ? Math.round(a.downtimeHours * cost * 100) / 100
          : a.lossAmount;
      const impact = impactOf(loss, s.dict.impactThresholds);
      if (loss === a.lossAmount && impact === a.impact) continue;
      r.assessment = {
        ...a,
        lossAmount: loss,
        hourlyCost: cost,
        impact,
        score: a.likelihood * impact,
        at: now,
      };
      r.impact = impact;
      r.history.unshift({
        at: now,
        text: `Техническая версия оценки: сумма ${loss.toLocaleString('ru-RU')} ₽, тяжесть ${impact}, R = ${a.likelihood * impact} (изменены настройки)`,
        by: 'Система',
        role: 'автоматически',
        kind: 'system',
      });
      changed++;
    }
  }
  log(
    s,
    by,
    `Изменены настройки: ${Object.keys(dict).join(', ')}${changed ? `; пересчитано рисков: ${changed}` : ''}`,
    now,
  );
  return s.dict;
}

// ── Import (analytics 02, §2.8) ──────────────────────────────────────────────

const IMPORT_FIELDS: Record<ImportType, string[]> = {
  risks: ['Название', 'Описание', 'Опасность', 'Категория', 'Процесс'],
  users: ['ФИО', 'Email', 'Должность', 'Дирекция', 'Роль'],
  assets: ['Объект', 'Стоимость часа простоя'],
};

export function importTemplate(type: ImportType): string[] {
  return IMPORT_FIELDS[type];
}

/** Validates rows and creates the valid ones: partial import keeps good data (UC import, alternatives). */
export function runImport(
  s: MockState,
  body: { type: ImportType; file: string; rows: string[][] },
  by: User,
  now: string,
  createRisk: (row: string[]) => string | null,
): ImportResult {
  const errors: ImportResult['errors'] = [];
  let created = 0;
  body.rows.forEach((row, k) => {
    const n = k + 2; // header is row 1
    const [a = '', b = '', c = '', d = '', e = ''] = row.map((x) => x.trim());
    let error: string | null = null;
    if (body.type === 'risks') error = createRisk(row);
    else if (body.type === 'users') {
      const role = (e.toUpperCase() || 'EMPLOYEE') as Role;
      if (!s.roles.some((r) => r.code === role)) error = `Неизвестная роль «${e}»`;
      else if (d && !s.dict.directorates.includes(d)) error = `Дирекция «${d}» не найдена`;
      else {
        const res = createUser(
          s,
          { fullName: a, email: b, position: c, directorate: d, roles: [role] },
          by,
          now,
        );
        error = typeof res === 'string' ? res : null;
      }
    } else {
      const cost = Number(b.replace(/\s/g, '').replace(',', '.'));
      if (!a) error = 'Не указано название объекта';
      else if (!(cost > 0)) error = 'Стоимость часа простоя должна быть больше 0';
      else if (s.dict.assets.some((x) => x.name.toLowerCase() === a.toLowerCase()))
        error = 'Такой объект уже есть';
      else s.dict.assets.push({ name: a, hourlyDowntimeCost: cost });
    }
    if (error) errors.push({ row: n, message: error });
    else created++;
  });
  const record: ImportRecord = {
    id: `I-${Date.now()}`,
    at: now,
    by: shortName(by.fullName),
    type: body.type,
    file: body.file,
    total: body.rows.length,
    created,
    errors: errors.length,
  };
  s.imports.unshift(record);
  log(s, by, `Импорт «${body.file}»: создано ${created} из ${body.rows.length}`, now);
  return { record, errors };
}
