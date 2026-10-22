import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';
import { API } from '../api';
import { LoginResponse, NewRisk, Risk } from '../models';
import { DEMO_PASSWORD, DICTIONARIES, RISKS, USERS } from './db';
import { createRisk, filterRisks, pageRisks, parseQuery, toCsv, validateNewRisk } from './risks';

type Handler = (req: HttpRequest<unknown>, params: string[]) => unknown;

// Risks created in the demo survive a page reload.
const STORE = 'rms.mock.risks';
const risks: Risk[] = (() => {
  try {
    return [...(JSON.parse(localStorage.getItem(STORE) ?? '[]') as Risk[]), ...RISKS];
  } catch {
    return [...RISKS];
  }
})();
const saveCreated = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(risks.slice(0, risks.length - RISKS.length)));
  } catch {}
};

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
  ['GET', /^dictionaries$/, (req) => (userFromToken(req), DICTIONARIES)],
  [
    'GET',
    /^risks$/,
    (req) => (userFromToken(req), pageRisks(risks, parseQuery(req.params), DICTIONARIES)),
  ],
  [
    'GET',
    /^risks\/export$/,
    (req) => {
      userFromToken(req);
      const ids = req.params.get('ids')?.split(',');
      const list = ids
        ? risks.filter((r) => ids.includes(r.id))
        : filterRisks(risks, parseQuery(req.params), DICTIONARIES);
      return new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' });
    },
  ],
  [
    'POST',
    /^risks$/,
    (req) => {
      const body = req.body as NewRisk;
      const error = validateNewRisk(body, userFromToken(req), DICTIONARIES);
      if (error) return fail(422, error);
      const risk = createRisk(risks, body, DICTIONARIES, new Date().toISOString().slice(0, 10));
      risks.unshift(risk);
      saveCreated();
      return risk;
    },
  ],
];

// ponytail: in-memory backend until the real API is reachable; drop it from app.config then.
export const mockApi: HttpInterceptorFn = (req, next): Observable<HttpEvent<unknown>> => {
  if (!req.url.startsWith(API + '/')) return next(req);
  const path = req.url.slice(API.length + 1).split('?')[0];

  for (const [method, pattern, handler] of routes) {
    const match = method === req.method && pattern.exec(path);
    if (!match) continue;
    try {
      const result = handler(req, match.slice(1));
      const body = result instanceof Blob ? result : structuredClone(result);
      return of(new HttpResponse({ status: 200, body })).pipe(delay(350));
    } catch (e) {
      return throwError(() => e).pipe(delay(350));
    }
  }
  return throwError(() => new HttpErrorResponse({ status: 404, url: req.url }));
};
