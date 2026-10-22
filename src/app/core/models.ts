export type Role = 'EMPLOYEE' | 'OWNER' | 'DIRECTOR' | 'CEO' | 'RISK_SPECIALIST' | 'ADMIN';

export const ROLE_NAMES: Record<Role, string> = {
  EMPLOYEE: 'Сотрудник',
  OWNER: 'Владелец процесса',
  DIRECTOR: 'Директор дирекции',
  CEO: 'Генеральный директор',
  RISK_SPECIALIST: 'Риск-менеджер',
  ADMIN: 'Администратор',
};

export interface User {
  id: string;
  fullName: string;
  email: string;
  position: string;
  roles: Role[];
  blocked: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ApiError {
  message: string;
}
