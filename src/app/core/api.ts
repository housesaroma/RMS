import { HttpErrorResponse } from '@angular/common/http';

export const API = '/api';

/** The backend is not reachable yet, so requests are served by core/mock. */
export const USE_MOCKS = true;

export function errorMessage(
  e: unknown,
  fallback = 'Что-то пошло не так. Повторите попытку.',
): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'Нет связи с сервером. Проверьте подключение.';
    return (e.error as { message?: string } | null)?.message ?? fallback;
  }
  return fallback;
}
