import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, UrlSegment, provideRouter } from '@angular/router';
import { AuthService, authGuard, authInterceptor } from './auth';
import { DEMO_PASSWORD } from './mock/db';
import { mockApi } from './mock/mock-api';

describe('AuthService with mock API', () => {
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, mockApi])),
      ],
    });
    auth = TestBed.inject(AuthService);
  });

  it('logs in, keeps the token per "remember" and restores the session', async () => {
    await auth.login('A.Belov@artsofte.example ', DEMO_PASSWORD, false);
    expect(auth.user()?.id).toBe('U-003');
    expect(sessionStorage.getItem('rms.token')).toBe('mock.U-003');
    expect(localStorage.getItem('rms.token')).toBeNull();

    auth.user.set(null);
    await auth.restore();
    expect(auth.user()?.fullName).toBe('Белов Александр Николаевич');
  });

  it('rejects a wrong password and a blocked account with readable messages', async () => {
    await expect(auth.login('a.belov@artsofte.example', 'nope', false)).rejects.toMatchObject({
      status: 401,
      error: { message: 'Неверный логин или пароль' },
    });
    await expect(
      auth.login('p.zaytsev@artsofte.example', DEMO_PASSWORD, true),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(auth.user()).toBeNull();
  });

  it('sends guests to /login with the requested path', () => {
    const tree = TestBed.runInInjectionContext(() =>
      authGuard({}, [new UrlSegment('risks', {}), new UrlSegment('R-0142', {})], {} as never),
    );
    expect(TestBed.inject(Router).serializeUrl(tree as never)).toBe(
      '/login?returnUrl=%2Frisks%2FR-0142',
    );
  });
});
