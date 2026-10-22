import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { AdminApi, AdminUserRow } from '../../core/admin-api';
import { errorMessage } from '../../core/api';
import { date } from '../../core/format';
import { ROLE_NAMES, Role } from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';

const ROLES: Role[] = ['EMPLOYEE', 'OWNER', 'DIRECTOR', 'CEO', 'RISK_SPECIALIST', 'ADMIN'];

/** New user or a profile: name, position, directorate and roles. Email is the login and never changes. */
@Component({
  selector: 'app-user-dialog',
  imports: [Icon],
  template: `
    <div class="dialog body">
      <div class="head">
        <div class="grow">
          <h2 id="ud-title">{{ user ? user.fullName : 'Новый пользователь' }}</h2>
          <p class="muted lead">
            @if (user) {
              {{ user.id }} · создан {{ date(user.createdAt) }} ·
              {{ user.blocked ? 'заблокирован' : 'активен' }}
            } @else {
              На email придёт письмо с временным паролем, он действует 10 дней.
            }
          </p>
        </div>
        <button
          type="button"
          class="icon-btn btn--ghost"
          aria-label="Закрыть окно"
          (click)="close()"
        >
          <ui-icon name="close" [size]="16" />
        </button>
      </div>
      <form class="form" (submit)="submit($event)">
        <label class="field">
          <span class="muted">ФИО *</span>
          <input
            class="input"
            type="text"
            [value]="fullName()"
            (input)="fullName.set($any($event.target).value)"
            placeholder="Фамилия Имя Отчество"
          />
        </label>
        <div class="grid2">
          <label class="field">
            <span class="muted">Email (логин) *</span>
            <input
              class="input"
              type="email"
              [value]="email()"
              [disabled]="!!user"
              (input)="email.set($any($event.target).value)"
              placeholder="name@artsofte.example"
            />
          </label>
          <label class="field">
            <span class="muted">Должность</span>
            <input
              class="input"
              type="text"
              [value]="position()"
              (input)="position.set($any($event.target).value)"
            />
          </label>
        </div>
        <label class="field">
          <span class="muted">Основная дирекция</span>
          <span class="select">
            <select class="input" (change)="directorate.set($any($event.target).value)">
              <option value="" [selected]="!directorate()">Вне оргструктуры</option>
              @for (d of directorates(); track d) {
                <option [value]="d" [selected]="d === directorate()">{{ d }}</option>
              }
            </select>
          </span>
        </label>
        <fieldset class="field fieldset">
          <legend class="muted">Роли * · права = объединение прав ролей</legend>
          @for (r of roles; track r) {
            <label class="check role">
              <input type="checkbox" [checked]="picked().includes(r)" (change)="toggle(r)" />
              <span class="grow">{{ names[r] }}</span>
              <span class="muted xs">{{ r }}</span>
            </label>
          }
        </fieldset>
        @if (error()) {
          <div class="field__error strong" role="alert">{{ error() }}</div>
        }
        <div class="buttons">
          <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Отмена</button>
          <button type="submit" class="btn btn--sm" [disabled]="!valid() || busy()">
            {{ user ? 'Сохранить' : 'Создать и отправить письмо' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styleUrl: '../risk-card/dialog.scss',
  styles: `
    .role {
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
    }
  `,
})
export class UserDialog {
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly api = inject(AdminApi);
  protected readonly user = inject<AdminUserRow | null>(DIALOG_DATA);
  private readonly dict = inject(RisksApi).dictionaries;
  protected readonly directorates = computed(() => this.dict.value()?.directorates ?? []);

  protected readonly roles = ROLES;
  protected readonly names = ROLE_NAMES;
  protected readonly date = date;
  protected readonly fullName = signal(this.user?.fullName ?? '');
  protected readonly email = signal(this.user?.email ?? '');
  protected readonly position = signal(this.user?.position ?? '');
  protected readonly directorate = signal(this.user?.directorate ?? '');
  protected readonly picked = signal<Role[]>(this.user?.roles ?? ['EMPLOYEE']);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly valid = computed(
    () =>
      this.fullName().trim().split(/\s+/).length >= 2 &&
      !!this.email().trim() &&
      this.picked().length > 0,
  );

  protected toggle(r: Role): void {
    this.picked.update((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  }

  protected async submit(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const body = {
      fullName: this.fullName(),
      position: this.position(),
      directorate: this.directorate() || null,
      roles: this.picked(),
    };
    try {
      if (this.user) await this.api.updateUser(this.user.id, body);
      else
        await this.api.createUser({
          ...body,
          email: this.email(),
          directorate: this.directorate(),
        });
      this.ref.close(true);
    } catch (err) {
      this.error.set(errorMessage(err));
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
