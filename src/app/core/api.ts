import { HttpErrorResponse } from '@angular/common/http';

export const API = '/api';

declare const RMS_BACKEND: boolean | undefined;

/**
 * Mocks serve the public demo; `ng serve` talks to the stand through the dev proxy.
 * Set by `define` in angular.json.
 */
export const USE_MOCKS = typeof RMS_BACKEND === 'undefined' || !RMS_BACKEND;

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
