export type Role = 'EMPLOYEE' | 'OWNER' | 'DIRECTOR' | 'CEO' | 'RISK_SPECIALIST' | 'ADMIN';

export const ROLE_NAMES: Record<Role, string> = {
  EMPLOYEE: 'Сотрудник',
  OWNER: 'Владелец процесса',
  DIRECTOR: 'Директор дирекции',
  CEO: 'Генеральный директор',
  RISK_SPECIALIST: 'Риск-менеджер',
  ADMIN: 'Администратор',
};

/** Rights come from the server; the UI only hides what the user cannot do. */
export type Right =
  | 'view_risk'
  | 'create_risk'
  | 'edit_risk'
  | 'assess_risk'
  | 'comment_risk'
  | 'accept_owner_risk'
  | 'accept_director_risk'
  | 'accept_ceo_risk'
  | 'close_risk'
  | 'create_treatment'
  | 'execute_treatment'
  | 'edit_treatment'
  | 'assign_treatment_executor'
  | 'approve_owner_treatment'
  | 'approve_director_treatment'
  | 'approve_ceo_treatment'
  | 'admin';

export interface User {
  id: string;
  fullName: string;
  email: string;
  position: string;
  roles: Role[];
  rights: Right[];
  /** Primary directorate; null for users outside the org structure. */
  directorate: string | null;
  blocked: boolean;
}

export type RiskStatus = 'DRAFT' | 'ACTIVE' | 'REASSESSMENT' | 'ACCEPTED' | 'CLOSED';

export const RISK_STATUS_NAMES: Record<RiskStatus, string> = {
  DRAFT: 'Черновик',
  ACTIVE: 'Активен',
  REASSESSMENT: 'Ожидает переоценки',
  ACCEPTED: 'Принят',
  CLOSED: 'Закрыт',
};

export type MeasureStatus =
  'DRAFT' | 'APPROVAL' | 'APPROVED' | 'PENDING' | 'IN_PROGRESS' | 'HOLD' | 'DONE' | 'CANCELLED';

export const MEASURE_STATUS_NAMES: Record<MeasureStatus, string> = {
  DRAFT: 'Черновик',
  APPROVAL: 'На согласовании',
  APPROVED: 'Согласовано',
  PENDING: 'Ожидает выполнения',
  IN_PROGRESS: 'В работе',
  HOLD: 'Холд',
  DONE: 'Готово',
  CANCELLED: 'Отменено',
};

export type Level = 'OWNER' | 'DIRECTOR' | 'CEO' | 'TREATMENT_REQUIRED';

/** Upper bounds of R for OWNER, DIRECTOR and CEO; above CEO the risk must be treated. */
export interface Thresholds {
  owner: number;
  director: number;
  ceo: number;
}

export function levelOf(score: number, t: Thresholds): Level {
  return score <= t.owner
    ? 'OWNER'
    : score <= t.director
      ? 'DIRECTOR'
      : score <= t.ceo
        ? 'CEO'
        : 'TREATMENT_REQUIRED';
}

export interface Risk {
  id: string;
  iso: string;
  name: string;
  description: string;
  hazard: string;
  category: string;
  process: string;
  directorate: string;
  owner: string;
  asset: string | null;
  createdAt: string; // ISO date
  /** Current assessment; null when the risk has none (draft or waiting for reassessment). */
  likelihood: number | null;
  impact: number | null;
  status: RiskStatus;
  top: boolean;
}

export interface Process {
  name: string;
  directorate: string;
  owner: string;
  /** User id of the owner when the owner has an account. */
  ownerId?: string;
}

export interface Asset {
  name: string;
  hourlyDowntimeCost: number;
}

/** Planned-cost lower bounds (₽, inclusive) for measure approval levels. */
export interface ApprovalThresholds {
  owner: number;
  director: number;
  ceo: number;
}

export interface Dictionaries {
  directorates: string[];
  categories: string[];
  hazards: string[];
  processes: Process[];
  assets: Asset[];
  thresholds: Thresholds;
  /** Inclusive lower money bounds (₽) of impact levels 1–5; level 0 starts at 0. */
  impactThresholds: [number, number, number, number, number];
  approval: ApprovalThresholds;
  /** Directorate → its director's name. */
  directors: Record<string, string>;
  ceo: string;
  /** Employees who may execute measures, by directorate. */
  staff: Record<string, string[]>;
}

export const LIKELIHOOD_NAMES = [
  'Невозможно',
  'Почти невозможно',
  'Маловероятно',
  'Возможно',
  'Вероятно',
  'Почти неизбежно',
];

export const IMPACT_NAMES = [
  'Нет влияния',
  'Незначительная',
  'Низкая',
  'Средняя',
  'Высокая',
  'Критическая',
];

export type ResponseMode = 'accept' | 'treat' | 'split' | 'transfer';

export const RESPONSE_MODE_NAMES: Record<ResponseMode, string> = {
  accept: 'Принять',
  treat: 'Обработать',
  split: 'Разделить',
  transfer: 'Передать',
};

export interface Assessment {
  likelihood: number;
  impact: number;
  score: number;
  lossAmount: number;
  /** Snapshot of the asset's hourly cost; null for risks without an asset. */
  hourlyCost: number | null;
  downtimeHours: number | null;
  by: string;
  byRole: string;
  at: string; // ISO datetime
}

export interface Measure {
  id: string;
  title: string;
  description: string;
  status: MeasureStatus;
  process: string;
  dueDate: string;
  costPlanned: number;
  costActual: number | null;
  executor: string | null;
  author: string;
  sentAt: string | null;
  decidedAt: string | null;
  doneAt: string | null;
  /** Approval requests, newest first; at most one is open (status APPROVAL). */
  requests: ApprovalRequest[];
}

export type RequestStatus = 'APPROVAL' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export const REQUEST_STATUS_NAMES: Record<RequestStatus, string> = {
  APPROVAL: 'На согласовании',
  APPROVED: 'Согласовано',
  REJECTED: 'Не согласовано',
  REVOKED: 'Отозвано',
};

export type ApprovalLevel = 'NONE' | 'OWNER' | 'DIRECTOR' | 'CEO';

export interface ApprovalRequest {
  level: Exclude<ApprovalLevel, 'NONE'>;
  status: RequestStatus;
  sentAt: string;
  sentBy: string;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
}

export type MeasureAction =
  | 'send'
  | 'handover'
  | 'approve'
  | 'reject'
  | 'revoke'
  | 'start'
  | 'hold'
  | 'resume'
  | 'finish'
  | 'cancel';

export interface MeasureActionInput {
  action: MeasureAction;
  reason?: string;
  executor?: string;
  costActual?: number;
}

/** A measure with its risk context, as listed on the measures screen. */
export interface MeasureRow extends Measure {
  riskId: string;
  riskName: string;
  directorate: string;
  owner: string;
  /** Actions for the current user, computed by the server with the same rules as the card. */
  actions: { action: MeasureAction; ok: boolean; why: string; ends: boolean }[];
  /** The risk still has draft measures (warning when an action ends the cycle). */
  draftsLeft: boolean;
}

export interface MeasureQuery {
  tab: 'all' | 'mine';
  status: MeasureStatus | '';
  q: string;
  directorate: string;
  executor: string;
  from: string;
  to: string;
  page: number;
}

export interface MeasurePage {
  items: MeasureRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<MeasureStatus | 'all', number>;
  /** Tab badges: everything and the user's own assignments. */
  tabs: { all: number; mine: number; approvals: number };
}

export interface ApprovalItem {
  measure: MeasureRow;
  request: ApprovalRequest;
  /** Whether the current user may decide it. */
  mine: boolean;
  approver: string;
}

export interface ApprovalsPage {
  pending: ApprovalItem[];
  history: (ApprovalRequest & { measureId: string; title: string; riskId: string })[];
}

export type HistoryKind = 'create' | 'assess' | 'mode' | 'measure' | 'approval' | 'done' | 'system';

export interface HistoryEvent {
  at: string; // ISO datetime
  text: string;
  by: string;
  role: string;
  kind: HistoryKind;
}

export interface RiskComment {
  id: string;
  authorId: string;
  author: string;
  role: string;
  at: string; // ISO datetime
  text: string;
}

export interface RiskDetails extends Risk {
  createdAtTime: string; // ISO datetime
  closedAt: string | null;
  closeReason: string | null;
  closedBy: string | null;
  author: string;
  authorPosition: string;
  secondary: Process[];
  responseMode: ResponseMode | null;
  modeAt: string | null;
  /** Current assessment; when status is REASSESSMENT this is null and `previous` holds the last one. */
  assessment: Assessment | null;
  previous: Assessment | null;
  measures: Measure[];
  history: HistoryEvent[];
  comments: RiskComment[];
  related: Risk[];
}

export interface AssessmentInput {
  likelihood: number;
  /** For risks without an asset. */
  lossAmount?: number;
  /** For risks with an asset. */
  weeks?: number;
  days?: number;
  hours?: number;
}

export interface NewMeasure {
  title: string;
  description: string;
  process: string;
  dueDate: string;
  costPlanned: number;
}

export type RiskTab = 'all' | 'top' | Exclude<RiskStatus, 'CLOSED'>;

export interface RiskQuery {
  tab: RiskTab;
  q: string;
  directorate: string;
  category: string;
  owner: string;
  from: string;
  to: string;
  /** Only risks with R ≥ the CEO lower bound. */
  ceo: boolean;
  sort: '' | 'asc' | 'desc';
  page: number;
}

export interface RiskPage {
  items: Risk[];
  total: number;
  page: number;
  pageSize: number;
  /** Registry-wide counts for the status tabs, independent of filters. */
  counts: Record<RiskStatus | 'all' | 'top', number>;
}

export interface NewRisk {
  name: string;
  description: string;
  hazard: string;
  category: string;
  process: string;
  asset: string;
  top: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ApiError {
  message: string;
}

export type Period = 'week' | 'month' | 'quarter' | 'year';

export interface DashboardData {
  period: Period;
  from: string;
  to: string;
  /** Per status, with the change over the period. */
  statuses: { status: RiskStatus | 'all'; n: number; delta: number }[];
  attention: {
    top: number;
    topCritical: number;
    topUnassessed: number;
    unassessed: number;
    unassessedOld: number;
    decision: number;
    measuresActive: number;
    measuresApproval: number;
  };
  /** Total loss of active risks by week. */
  sum: { total: number; series: { date: string; value: number }[] };
  directorates: { name: string; counts: Record<RiskStatus, number>; loss: number }[];
  top: RiskDetails[];
  /** heat[l-1][i-1] = number of current assessments in the cell. */
  heat: number[][];
  levels: Record<Level, number>;
  kri: { name: string; value: string; limit: string; state: 'ok' | 'warn' | 'bad'; pct: number }[];
  mitigation: Record<MeasureStatus, number>;
  dynamics: { week: string; total: number; unassessed: number }[];
  approvals: {
    id: string;
    title: string;
    riskId: string;
    cost: number;
    level: ApprovalLevel;
    sentAt: string;
  }[];
}

export const CLOSE_REASONS = [
  'Меры выполнены',
  'Риск неактуален',
  'Объединён с другим риском',
  'Другое',
];

/** A closed risk as listed in the archive. */
export interface ArchiveRow extends Risk {
  closedAt: string;
  closeReason: string;
  closedBy: string;
  /** R of the last assessment, if there was one. */
  lastScore: number | null;
}

export interface ArchiveQuery {
  q: string;
  hazard: string;
  category: string;
  owner: string;
  from: string;
  to: string;
  page: number;
}

export interface ArchivePage {
  items: ArchiveRow[];
  total: number;
  page: number;
  pageSize: number;
  /** All risks in the system, for "closed N of M". */
  all: number;
  lastClosedAt: string | null;
}
