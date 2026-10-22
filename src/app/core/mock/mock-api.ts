import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';
import { API } from '../api';
import {
  AssessmentInput,
  MeasureActionInput,
  LoginResponse,
  NewMeasure,
  NewRisk,
  Period,
  ResponseMode,
  RiskDetails,
} from '../models';
import { DEMO_PASSWORD, DICTIONARIES, USERS } from './db';
import {
  addComment,
  addMeasure,
  assess,
  chooseMode,
  createRisk,
  filterRisks,
  pageRisks,
  parseQuery,
  riskCard,
  toCsv,
  toRisk,
  validateNewRisk,
} from './risks';
import { seedRisks } from './seed';
import { dashboard } from './dashboard';
import { approvalsFor, pageMeasures, parseMeasureQuery, transitionMeasure } from './measures';

type Handler = (req: HttpRequest<unknown>, params: string[]) => unknown;

// Everything changed in the demo survives a page reload; bump the key when the seed changes shape.
const STORE = 'rms.mock.v4';
const risks: RiskDetails[] = (() => {
  try {
    ['rms.mock.risks', 'rms.mock.v2', 'rms.mock.v3'].forEach((k) => localStorage.removeItem(k));
    return (
      (JSON.parse(localStorage.getItem(STORE) ?? 'null') as RiskDetails[] | null) ?? seedRisks()
    );
  } catch {
    return seedRisks();
  }
})();
const save = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(risks));
  } catch {}
};

const fail = (status: number, message: string): never => {
  throw new HttpErrorResponse({ status, statusText: message, error: { message } });
};

const userFromToken = (req: HttpRequest<unknown>) => {
  const id = req.headers.get('Authorization')?.replace('Bearer mock.', '');
  return USERS.find((u) => u.id === id && !u.blocked) ?? fail(401, 'Сессия истекла');
};

const find = (id: string) => risks.find((r) => r.id === id) ?? fail(404, 'Риск не найден');

/** Runs a card mutation; a returned message becomes a 422, success returns the fresh card. */
const mutate = (
  req: HttpRequest<unknown>,
  id: string,
  change: (r: RiskDetails) => string | null,
) => {
  userFromToken(req);
  const error = change(find(id));
  if (error) return fail(422, error);
  save();
  return riskCard(risks, id);
};

const now = () => new Date().toISOString();

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
    (req) => {
      userFromToken(req);
      const page = pageRisks(risks, parseQuery(req.params), DICTIONARIES);
      return { ...page, items: page.items.map((r) => toRisk(r as RiskDetails)) };
    },
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
      const user = userFromToken(req);
      const body = req.body as NewRisk;
      const error = validateNewRisk(body, user, DICTIONARIES);
      if (error) return fail(422, error);
      const risk = createRisk(risks, body, user, DICTIONARIES, now());
      risks.unshift(risk);
      save();
      return toRisk(risk);
    },
  ],
  [
    'GET',
    /^risks\/(R-\d+)$/,
    (req, [id]) => (userFromToken(req), riskCard(risks, id) ?? fail(404, 'Риск не найден')),
  ],
  [
    'POST',
    /^risks\/(R-\d+)\/assessments$/,
    (req, [id]) =>
      mutate(req, id, (r) =>
        assess(r, req.body as AssessmentInput, userFromToken(req), DICTIONARIES, now()),
      ),
  ],
  [
    'POST',
    /^risks\/(R-\d+)\/mode$/,
    (req, [id]) =>
      mutate(req, id, (r) =>
        chooseMode(
          r,
          (req.body as { mode: ResponseMode }).mode,
          userFromToken(req),
          DICTIONARIES,
          now(),
        ),
      ),
  ],
  [
    'POST',
    /^risks\/(R-\d+)\/comments$/,
    (req, [id]) =>
      mutate(req, id, (r) =>
        addComment(r, (req.body as { text: string }).text, userFromToken(req), now()),
      ),
  ],
  [
    'POST',
    /^risks\/(R-\d+)\/measures$/,
    (req, [id]) =>
      mutate(req, id, (r) =>
        addMeasure(risks, r, req.body as NewMeasure, userFromToken(req), now()),
      ),
  ],
  [
    'GET',
    /^measures$/,
    (req) => pageMeasures(risks, parseMeasureQuery(req.params), userFromToken(req), DICTIONARIES),
  ],
  [
    'GET',
    /^dashboard$/,
    (req) => (
      userFromToken(req),
      dashboard(risks, (req.params.get('period') as Period) || 'quarter', DICTIONARIES)
    ),
  ],
  ['GET', /^approvals$/, (req) => approvalsFor(risks, userFromToken(req), DICTIONARIES)],
  [
    'POST',
    /^measures\/(М-\d+)\/actions$/,
    (req, [mid]) => {
      const owner =
        risks.find((r) => r.measures.some((m) => m.id === mid)) ?? fail(404, 'Мера не найдена');
      return mutate(req, owner.id, (r) =>
        transitionMeasure(
          r,
          mid,
          req.body as MeasureActionInput,
          userFromToken(req),
          DICTIONARIES,
          now(),
        ),
      );
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
