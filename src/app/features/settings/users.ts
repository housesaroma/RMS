import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { AdminApi, AdminUserRow } from '../../core/admin-api';
import { errorMessage } from '../../core/api';
import { initials } from '../../core/format';
import { ROLE_NAMES, Role } from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { Icon } from '../../ui/icon';
import { PageHeader } from '../../ui/page-header';
import { SettingsTabs, noteOf } from './settings-tabs';
import { UserDialog } from './user-dialog';

@Component({
  selector: 'app-settings-users',
  imports: [PageHeader, SettingsTabs, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './users.html',
  styleUrl: './settings.scss',
})
export class Users {
  private readonly api = inject(AdminApi);
  private readonly dialog = inject(Dialog);
  protected readonly dict = inject(RisksApi).dictionaries;
  protected readonly note = noteOf('users');

  protected readonly list = resource({ loader: () => this.api.users() });
  protected readonly roleNames = ROLE_NAMES;
  protected readonly roleCodes = Object.keys(ROLE_NAMES) as Role[];
  protected readonly initials = initials;

  protected readonly q = signal('');
  protected readonly role = signal<Role | ''>('');
  protected readonly dir = signal('');
  protected readonly status = signal<'all' | 'active' | 'blocked'>('all');
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);

  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return (this.list.value() ?? []).filter(
      (u) =>
        (!q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (!this.role() || u.roles.includes(this.role() as Role)) &&
        (!this.dir() || u.directorate === this.dir()) &&
        (this.status() === 'all' || u.blocked === (this.status() === 'blocked')),
    );
  });

  protected readonly kpis = computed(() => {
    const all = this.list.value() ?? [];
    return [
      { label: 'Всего пользователей', n: all.length, note: 'включая заблокированных' },
      { label: 'Активных', n: all.filter((u) => !u.blocked).length, note: 'могут войти в систему' },
      {
        label: 'Заблокированы',
        n: all.filter((u) => u.blocked).length,
        note: 'вход закрыт, история сохранена',
      },
      {
        label: 'Без оргпривязки',
        n: all.filter((u) => !u.blocked && !u.directorate).length,
        note: 'активные, вне оргструктуры',
      },
    ];
  });

  protected readonly filtered = computed(
    () => !!(this.q() || this.role() || this.dir() || this.status() !== 'all'),
  );

  /** CDK reuses the first menu context, so read the row fresh. */
  protected byId(id: string): AdminUserRow {
    return this.list.value()!.find((u) => u.id === id)!;
  }

  protected reset(): void {
    this.q.set('');
    this.role.set('');
    this.dir.set('');
    this.status.set('all');
  }

  protected open(user: AdminUserRow | null): void {
    this.dialog
      .open<boolean>(UserDialog, {
        data: user,
        width: '600px',
        maxWidth: 'calc(100vw - 32px)',
        backdropClass: 'dialog-backdrop',
        ariaLabelledBy: 'ud-title',
      })
      .closed.subscribe((saved) => {
        if (!saved) return;
        this.notice.set({
          text: user
            ? 'Изменения сохранены.'
            : 'Пользователь создан, письмо с временным паролем отправлено.',
          error: false,
        });
        this.list.reload();
      });
  }

  protected async setBlocked(u: AdminUserRow, blocked: boolean): Promise<void> {
    try {
      await this.api.updateUser(u.id, { blocked });
      this.notice.set({
        text: `${u.fullName} ${blocked ? 'заблокирован: вход закрыт, история сохранена' : 'разблокирован'}.`,
        error: false,
      });
      this.list.reload();
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
    }
  }

  /** Mail is out of scope of the mock: the action only confirms what the backend will do. */
  protected mail(u: AdminUserRow, what: 'reset' | 'resend'): void {
    this.notice.set({
      text:
        what === 'reset'
          ? `Пароль сброшен, письмо с временным паролем отправлено на ${u.email}.`
          : `Письмо с данными доступа отправлено повторно на ${u.email}.`,
      error: false,
    });
  }
}
