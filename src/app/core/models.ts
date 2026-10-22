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
export type Right = 'view_risk' | 'create_risk' | 'admin';

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
}

export interface Asset {
  name: string;
  hourlyDowntimeCost: number;
}

export interface Dictionaries {
  directorates: string[];
  categories: string[];
  hazards: string[];
  processes: Process[];
  assets: Asset[];
  thresholds: Thresholds;
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
