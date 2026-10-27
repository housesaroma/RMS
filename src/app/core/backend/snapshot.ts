import {
  AdminUser,
  Dictionaries,
  IMPACT_NAMES,
  LIKELIHOOD_NAMES,
  Measure,
  MeasureStatus,
  RequestStatus,
  Right,
  RightDef,
  RiskDetails,
  RiskStatus,
  Role,
  RoleDef,
} from '../models';
import { MockState } from '../mock/admin';
import { DEFAULT_MATRIX, DICTIONARIES as DEFAULT_DICT, ROLE_DEFS } from '../mock/db';
import { shortName } from '../mock/risks';

// ── DTOs of the backend (swagger /v1), only the fields the UI reads ─────────

export interface UserDto {
  userId: number;
  fullName: string | null;
  email: string | null;
  isUserActive: boolean;
  roles: string[];
  personId?: number | null;
  directorateId?: number | null;
}
export interface RoleDto {
  roleId: number;
  roleCode: string;
  roleName: string | null;
  isRoleActive: boolean;
}
export interface RightDto {
  rightId: number;
  rightCode: string;
  rightDescription: string | null;
}
export interface DirectorateDto {
  directorateId: number;
  directorateTitle: string | null;
  isDirectorateActive: boolean;
}
export interface ProcessDto {
  processId: number;
  directorateId: number;
  processTitle: string | null;
  /** Person card id (org.persons), not a user id. */
  ownerId: number;
  isProcessActive: boolean;
}
export interface PersonDto {
  personId: number;
  userId: number | null;
  directorateId: number | null;
  personPosition: string | null;
  isPersonActive: boolean;
}
export interface AssetDto {
  assetId: number;
  assetTitle: string | null;
  assetHourCost: number;
  isAssetActive: boolean;
}
export interface CategoryDto {
  categoryId: number;
  categoryName: string | null;
  isActive: boolean;
}
export interface HazardDto {
  hazardId: number;
  hazardGroupId: number;
  hazardName: string | null;
  isActive: boolean;
}
export interface HazardGroupDto {
  hazardGroupId: number;
  hazardGroupName: string | null;
  isActive: boolean;
}
export interface ImpactLevelDto {
  impactLevelId: number;
  impactLevelWeight: number;
  impactLevelLoss: number;
  impactLevelMax: number;
}
export interface RiskListItemDto {
  riskId: number;
  riskTitle: string | null;
  processes: string[];
  directorates: string[];
  owners: string[];
  asset: string | null;
  hazard: string | null;
  category: string | null;
  likelihood: string | null;
  impact: string | null;
  riskScore: number | null;
  riskStatus: string | null;
  acceptanceLevel: string | null;
  /** Risk–process link ids, index-aligned with `processes`. */
  riskProcessIds?: number[];
}
export interface TreatmentDto {
  treatmentId: number;
  riskId: number;
  riskProcessId: number;
  treatmentTitle: string;
  treatmentDescription: string | null;
  treatmentStatus: string;
  dueDate: string;
  treatmentCostPlan: number;
  treatmentCostAct: number;
  createdById: number;
  assigneeId: number | null;
  createdAt: string;
  updatedAt: string | null;
  approvalRequestId: number | null;
  approvalRequiredLevel: string | null;
  approvalRequestStatus: string | null;
}
export interface CommentDto {
  commentId: number;
  authorId: number;
  text: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Everything the screens read, loaded from the backend at once. */
export interface Raw {
  users: UserDto[];
  roles: RoleDto[];
  rights: RightDto[];
  /** Backend right codes per role id; empty when the user may not read roles. */
  roleRights: Record<number, string[]>;
  directorates: DirectorateDto[];
  processes: ProcessDto[];
  persons: PersonDto[];
  assets: AssetDto[];
  categories: CategoryDto[];
  hazards: HazardDto[];
  hazardGroups: HazardGroupDto[];
  impact: ImpactLevelDto[];
  acceptance: { ownerMaxScore: number; directorMaxScore: number; ceoMaxScore: number } | null;
  approval: { ownerThreshold: number; directorThreshold: number; ceoThreshold: number } | null;
  risks: RiskListItemDto[];
  treatments: TreatmentDto[];
  /** Reads that failed, path → server message; screens decide whether to show it. */
  failed: Record<string, string>;
}

export interface Snapshot {
  raw: Raw;
  /** Same shape the mock keeps, so the read-side screens reuse its aggregations. */
  state: MockState;
  me: AdminUser;
}

// ── Ids: the UI keeps its readable ids, the backend uses integers ──────────

const pad = (n: number, w: number) => String(n).padStart(w, '0');
export const riskId = (n: number) => 'R-' + pad(n, 4);
export const userId = (n: number) => 'U-' + pad(n, 3);
export const measureId = (n: number) => 'М-' + pad(n, 4);
export const backendId = (id: string) => Number(id.replace(/\D/g, ''));

// ── Token ──────────────────────────────────────────────────────────────────

const CLAIM_ID = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
const CLAIM_EMAIL = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress';
const CLAIM_ROLE = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

/** Reads the identity from the JWT payload; the signature is the server's business. */
export function claims(token: string): { id: number; email: string; roles: Role[] } {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(part), (c) => c.charCodeAt(0)));
    const p = JSON.parse(json) as Record<string, unknown>;
    const role = p[CLAIM_ROLE];
    return {
      id: Number(p[CLAIM_ID]),
      email: String(p[CLAIM_EMAIL] ?? ''),
      roles: (Array.isArray(role) ? role : role ? [role] : []) as Role[],
    };
  } catch {
    return { id: 0, email: '', roles: [] };
  }
}

// ── Rights: the backend has 14 coarse rights, the UI gates on finer ones ───

const LEVEL_OF_ROLE: Partial<Record<Role, 'owner' | 'director' | 'ceo'>> = {
  OWNER: 'owner',
  DIRECTOR: 'director',
  CEO: 'ceo',
  RISK_SPECIALIST: 'ceo',
};

/** Backend codes of one role → UI rights; accept and approve get the role's level. */
export function uiRights(role: Role, codes: string[]): Right[] {
  if (role === 'ADMIN') return ['admin'];
  const level = LEVEL_OF_ROLE[role];
  return codes.flatMap((code): Right[] => {
    switch (code) {
      case 'comment_components':
        return ['comment_risk', 'comment_treatment'];
      case 'create_components':
        return ['create_risk', 'create_treatment'];
      case 'edit_components':
        return ['edit_risk', 'edit_treatment'];
      case 'accept_risk':
        return level ? [`accept_${level}_risk`] : [];
      case 'approve_treatment':
        return level ? [`approve_${level}_treatment`] : [];
      case 'work_report':
        return ['view_report', 'export_report'];
      default:
        return [code as Right];
    }
  });
}

export function rightGroup(code: string): string {
  if (/treatment/.test(code)) return 'Меры';
  if (/report|import/.test(code)) return 'Отчёты и данные';
  return 'Риски и комментарии';
}

// ── Mapping ────────────────────────────────────────────────────────────────

/** Backend risk statuses (Domain.Risk.RiskStatus names) → UI statuses. */
const MEASURE_STATUS: Record<string, MeasureStatus> = {
  Planned: 'DRAFT',
  PendingApproval: 'APPROVAL',
  Approved: 'APPROVED',
  AwaitingExecution: 'PENDING',
  InProgress: 'IN_PROGRESS',
  Hold: 'HOLD',
  Completed: 'DONE',
  Cancelled: 'CANCELLED',
};
const REQUEST_STATUS: Record<string, RequestStatus> = {
  Pending: 'APPROVAL',
  Approved: 'APPROVED',
  Rejected: 'REJECTED',
  Revoked: 'REVOKED',
};

/** Process title of a risk–process link, read from the list row it belongs to. */
export const linkProcess = (x: RiskListItemDto | undefined, linkId: number) =>
  x?.processes[x.riskProcessIds?.indexOf(linkId) ?? -1] ?? x?.processes[0] ?? '';

// ponytail: the list has no request history, dates of sending/decision or decider; only the
// latest request is shown until the API returns approval requests per treatment.
function toMeasure(t: TreatmentDto, row: RiskListItemDto | undefined, name: (id: number) => string): Measure {
  const status = MEASURE_STATUS[t.treatmentStatus] ?? 'DRAFT';
  const level = t.approvalRequiredLevel?.toUpperCase() as Measure['requests'][number]['level'] | undefined;
  return {
    id: measureId(t.treatmentId),
    title: t.treatmentTitle,
    description: t.treatmentDescription ?? '',
    status,
    process: linkProcess(row, t.riskProcessId),
    dueDate: t.dueDate.slice(0, 10),
    costPlanned: t.treatmentCostPlan,
    costActual: status === 'DONE' ? t.treatmentCostAct : null,
    executor: t.assigneeId ? name(t.assigneeId) : null,
    author: name(t.createdById),
    sentAt: null,
    decidedAt: null,
    doneAt: status === 'DONE' ? (t.updatedAt ?? '').slice(0, 10) || null : null,
    requests:
      t.approvalRequestId && level
        ? [
            {
              level,
              status: REQUEST_STATUS[t.approvalRequestStatus ?? ''] ?? 'APPROVAL',
              sentAt: '',
              sentBy: '',
              decidedAt: null,
              decidedBy: null,
              reason: null,
            },
          ]
        : [],
  };
}

const STATUS: Record<string, RiskStatus> = {
  Draft: 'DRAFT',
  Open: 'ACTIVE',
  InTreatment: 'ACTIVE',
  Accepted: 'ACCEPTED',
  Closed: 'CLOSED',
  AwaitingReassessment: 'REASSESSMENT',
};

/** Likelihood and impact come as a number or a level name. */
function levelOf(v: string | null, names: string[]): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const k = names.findIndex((x) => x.toLowerCase() === v.toLowerCase());
  return k < 0 ? null : k;
}

// ponytail: the list has no description, dates, author, response mode, measures or history; the card
// shows what the list carries until the backend adds GET /v1/risks/{id}.
function toDetails(x: RiskListItemDto): RiskDetails {
  const [process = '', ...rest] = x.processes ?? [];
  const status = STATUS[x.riskStatus ?? ''] ?? 'DRAFT';
  const l = levelOf(x.likelihood, LIKELIHOOD_NAMES),
    i = levelOf(x.impact, IMPACT_NAMES);
  const assessment =
    l != null && i != null
      ? {
          likelihood: l,
          impact: i,
          score: x.riskScore ?? l * i,
          lossAmount: 0,
          hourlyCost: null,
          downtimeHours: null,
          by: '',
          byRole: '',
          at: '',
        }
      : null;
  const waits = status === 'REASSESSMENT';
  return {
    id: riskId(x.riskId),
    iso: '—',
    name: x.riskTitle ?? '',
    description: '',
    hazard: x.hazard ?? '',
    category: x.category ?? '',
    process,
    directorate: x.directorates?.[0] ?? '',
    owner: x.owners?.[0] ?? '',
    asset: x.asset || null,
    createdAt: '',
    createdAtTime: '',
    closedAt: null,
    closeReason: null,
    closedBy: null,
    likelihood: waits ? null : l,
    impact: waits ? null : i,
    status,
    top: false,
    author: '',
    authorPosition: '',
    secondary: rest.map((name, k) => ({
      name,
      directorate: x.directorates?.[k + 1] ?? '',
      owner: x.owners?.[k + 1] ?? '',
    })),
    // ponytail: `treat` on an Open risk lives only in the assessment, which the list does not return.
    responseMode:
      x.riskStatus === 'Accepted' ? 'accept' : x.riskStatus === 'InTreatment' ? 'treat' : null,
    modeAt: null,
    assessment: waits ? null : assessment,
    previous: waits ? assessment : null,
    measures: [],
    history: [],
    comments: [],
    related: [],
  };
}

export function build(raw: Raw, token: string): Snapshot {
  const dirName = (id: number | null | undefined) =>
    raw.directorates.find((d) => d.directorateId === id)?.directorateTitle ?? null;
  const personOf = (uid: number) => raw.persons.find((p) => p.userId === uid && p.isPersonActive);

  const users: AdminUser[] = raw.users.map((u) => {
    const p = personOf(u.userId);
    return {
      id: userId(u.userId),
      fullName: u.fullName || u.email || '',
      email: u.email ?? '',
      position: p?.personPosition ?? '',
      roles: u.roles as Role[],
      rights: [],
      directorate: dirName(p?.directorateId ?? u.directorateId),
      blocked: !u.isUserActive,
      createdAt: '',
    };
  });

  const known = raw.roles.length > 0 && Object.keys(raw.roleRights).length > 0;
  const roles: RoleDef[] = known
    ? raw.roles.map((r) => ({
        code: r.roleCode as Role,
        name: r.roleName ?? r.roleCode,
        desc: ROLE_DEFS.find((d) => d.code === r.roleCode)?.desc ?? '',
        active: r.isRoleActive,
      }))
    : structuredClone(ROLE_DEFS);
  const matrix = known
    ? (Object.fromEntries(
        raw.roles.map((r) => [
          r.roleCode,
          uiRights(r.roleCode as Role, raw.roleRights[r.roleId] ?? []),
        ]),
      ) as Record<Role, Right[]>)
    : structuredClone(DEFAULT_MATRIX);

  const name = (id: number) => {
    const u = raw.users.find((x) => x.userId === id);
    return u ? shortName(u.fullName || u.email || '') : '—';
  };
  const byRole = (role: Role) => users.filter((u) => u.roles.includes(role) && !u.blocked);
  const directorates = raw.directorates
    .filter((d) => d.isDirectorateActive)
    .map((d) => d.directorateTitle ?? '');
  const levels = [...raw.impact].sort((a, b) => a.impactLevelWeight - b.impactLevelWeight);
  const bounds = levels.filter((x) => x.impactLevelWeight > 0).map((x) => x.impactLevelLoss);

  const dict: Dictionaries = {
    directorates,
    categories: raw.categories.map((c) => c.categoryName ?? ''),
    hazards: raw.hazards.map((h) => h.hazardName ?? ''),
    processes: raw.processes
      .filter((p) => p.isProcessActive)
      .map((p) => {
        const owner = raw.persons.find((x) => x.personId === p.ownerId)?.userId;
        return {
          name: p.processTitle ?? '',
          directorate: dirName(p.directorateId) ?? '',
          owner: owner ? name(owner) : '—',
          ownerId: owner ? userId(owner) : undefined,
        };
      }),
    assets: raw.assets
      .filter((a) => a.isAssetActive)
      .map((a) => ({ name: a.assetTitle ?? '', hourlyDowntimeCost: a.assetHourCost })),
    thresholds: raw.acceptance
      ? {
          owner: raw.acceptance.ownerMaxScore,
          director: raw.acceptance.directorMaxScore,
          ceo: raw.acceptance.ceoMaxScore,
        }
      : DEFAULT_DICT.thresholds,
    impactThresholds:
      bounds.length === 5
        ? (bounds as Dictionaries['impactThresholds'])
        : DEFAULT_DICT.impactThresholds,
    approval: raw.approval
      ? {
          owner: raw.approval.ownerThreshold,
          director: raw.approval.directorThreshold,
          ceo: raw.approval.ceoThreshold,
        }
      : DEFAULT_DICT.approval,
    directors: Object.fromEntries(
      byRole('DIRECTOR')
        .filter((u) => u.directorate)
        .map((u) => [u.directorate!, shortName(u.fullName)]),
    ),
    ceo: byRole('CEO')[0] ? shortName(byRole('CEO')[0].fullName) : '—',
    staff: Object.fromEntries(
      directorates.map((d) => [
        d,
        users.filter((u) => u.directorate === d && !u.blocked).map((u) => shortName(u.fullName)),
      ]),
    ),
    disabled: [
      ...raw.categories.filter((c) => !c.isActive).map((c) => c.categoryName ?? ''),
      ...raw.hazards.filter((h) => !h.isActive).map((h) => h.hazardName ?? ''),
    ],
  };

  const state: MockState = {
    risks: raw.risks.map((x) => ({
      ...toDetails(x),
      measures: raw.treatments
        .filter((t) => t.riskId === x.riskId)
        .map((t) => toMeasure(t, x, name))
        .reverse(),
    })),
    users,
    dict,
    roles,
    matrix,
    imports: [],
    changes: [],
  };

  // Non-admins cannot list users yet, so their profile falls back to the token.
  const c = claims(token);
  const own = users.find((u) => u.id === userId(c.id));
  const base: AdminUser = own ?? {
    id: userId(c.id),
    fullName: c.email,
    email: c.email,
    position: '',
    roles: c.roles,
    rights: [],
    directorate: null,
    blocked: false,
    createdAt: '',
  };
  const me = { ...base, rights: [...new Set(base.roles.flatMap((r) => matrix[r] ?? []))] };
  return { raw, state, me };
}

/** Backend rights as the roles screen shows them. */
export function rightDefs(raw: Raw): RightDef[] {
  return raw.rights.map((r) => ({
    code: r.rightCode as Right,
    name: r.rightDescription ?? r.rightCode,
    group: rightGroup(r.rightCode),
  }));
}
