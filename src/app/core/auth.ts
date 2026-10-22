import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API } from './api';
import { LoginResponse, Role, User } from './models';

const KEY = 'rms.token';

function readToken(): string | null {
  try {
    return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null, remember = false): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    if (token) (remember ? localStorage : sessionStorage).setItem(KEY, token);
  } catch {}
}

@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly token = signal(readToken());
  readonly user = signal<User | null>(null);
  readonly isAdmin = computed(() => this.hasRole('ADMIN'));

  hasRole(role: Role): boolean {
    return this.user()?.roles.includes(role) ?? false;
  }

  /** Restores the session on startup; a stale token is dropped silently. */
  async restore(): Promise<void> {
    if (!this.token()) return;
    try {
      this.user.set(await firstValueFrom(this.http.get<User>(`${API}/auth/me`)));
    } catch {
      this.reset();
    }
  }

  async login(email: string, password: string, remember: boolean): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${API}/auth/login`, { email, password }),
    );
    writeToken(res.token, remember);
    this.token.set(res.token);
    this.user.set(res.user);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${API}/auth/logout`, null));
    } catch {}
    this.reset();
    await this.router.navigateByUrl('/login');
  }

  private reset(): void {
    writeToken(null);
    this.token.set(null);
    this.user.set(null);
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};

export const authGuard: CanMatchFn = (_route, segments) =>
  inject(AuthService).user()
    ? true
    : inject(Router).createUrlTree(['/login'], {
        queryParams: segments.length ? { returnUrl: '/' + segments.join('/') } : {},
      });

export const guestGuard: CanMatchFn = () =>
  inject(AuthService).user() ? inject(Router).createUrlTree(['/']) : true;

export const roleGuard =
  (role: Role): CanMatchFn =>
  () =>
    inject(AuthService).hasRole(role) ? true : inject(Router).createUrlTree(['/']);
