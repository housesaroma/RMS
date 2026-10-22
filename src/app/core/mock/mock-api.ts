import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';
import { API } from '../api';
import { LoginResponse } from '../models';
import { DEMO_PASSWORD, USERS } from './db';

type Handler = (req: HttpRequest<unknown>, params: string[]) => unknown;

const fail = (status: number, message: string) => {
  throw new HttpErrorResponse({ status, statusText: message, error: { message } });
};

const userFromToken = (req: HttpRequest<unknown>) => {
  const id = req.headers.get('Authorization')?.replace('Bearer mock.', '');
  return USERS.find((u) => u.id === id && !u.blocked) ?? fail(401, 'Сессия истекла');
};

const routes: [string, RegExp, Handler][] = [
  [
    'POST',
    /^auth\/login$/,
    (req) => {
      const { email, password } = req.body as { email: string; password: string };
      const user = USERS.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || password !== DEMO_PASSWORD) return fail(401, 'Неверный логин или пароль');
      if (user.blocked)
        return fail(403, 'Учётная запись заблокирована. Обратитесь к администратору.');
      return { token: 'mock.' + user.id, user } satisfies LoginResponse;
    },
  ],
  ['GET', /^auth\/me$/, (req) => userFromToken(req)],
  ['POST', /^auth\/logout$/, () => null],
];

// ponytail: in-memory backend until the real API is reachable; drop it from app.config then.
export const mockApi: HttpInterceptorFn = (req, next): Observable<HttpEvent<unknown>> => {
  if (!req.url.startsWith(API + '/')) return next(req);
  const path = req.url.slice(API.length + 1).split('?')[0];

  for (const [method, pattern, handler] of routes) {
    const match = method === req.method && pattern.exec(path);
    if (!match) continue;
    try {
      const body = structuredClone(handler(req, match.slice(1)));
      return of(new HttpResponse({ status: 200, body })).pipe(delay(350));
    } catch (e) {
      return throwError(() => e).pipe(delay(350));
    }
  }
  return throwError(() => new HttpErrorResponse({ status: 404, url: req.url }));
};
