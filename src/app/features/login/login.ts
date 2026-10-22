import { Component, inject, signal } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { USE_MOCKS, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth';
import { DEMO_PASSWORD } from '../../core/mock/db';
import { ThemeService } from '../../core/theme';
import { Icon } from '../../ui/icon';

@Component({
  selector: 'app-login',
  imports: [FormField, FormRoot, Icon],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly theme = inject(ThemeService);

  protected readonly demo = USE_MOCKS ? { password: DEMO_PASSWORD } : null;
  protected readonly showPassword = signal(false);
  protected readonly error = signal('');

  protected readonly model = signal({ email: '', password: '', remember: false });
  protected readonly f = form(
    this.model,
    (p) => {
      required(p.email, { message: 'Введите рабочий email' });
      email(p.email, { message: 'Проверьте формат email' });
      required(p.password, { message: 'Введите пароль' });
    },
    {
      submission: {
        onInvalid: (f) => f().markAsTouched(),
        action: async () => {
          this.error.set('');
          const { email, password, remember } = this.model();
          try {
            await this.auth.login(email, password, remember);
            const back = this.route.snapshot.queryParamMap.get('returnUrl') ?? '';
            // Only same-app paths, never "//host" or absolute URLs.
            await this.router.navigateByUrl(/^\/(?!\/)/.test(back) ? back : '/');
          } catch (e) {
            this.error.set(errorMessage(e));
          }
          return undefined;
        },
      },
    },
  );

  protected fill(email: string): void {
    this.model.set({ email, password: DEMO_PASSWORD, remember: false });
  }
}
