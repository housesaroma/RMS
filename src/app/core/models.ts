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
  | 'create_treatment'
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
  sentAt: string | null;
  decidedAt: string | null;
  doneAt: string | null;
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
