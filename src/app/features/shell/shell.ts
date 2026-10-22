import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { API } from '../../core/api';
import { ApprovalsPage, Right } from '../../core/models';
import { RisksApi } from '../../core/risks-api';
import { AuthService } from '../../core/auth';
import { ThemeService } from '../../core/theme';
import { Icon, IconName } from '../../ui/icon';
import { initials } from '../../core/format';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
  right?: Right;
}

const NAV: NavItem[] = [
  { path: '/dashboard', label: 'Дашборд', icon: 'grid' },
  { path: '/risks', label: 'Риски', icon: 'alert' },
  { path: '/measures', label: 'Меры и согласования', icon: 'tasks' },
  { path: '/reports', label: 'Отчёты', icon: 'chart', right: 'view_report' },
  { path: '/archive', label: 'Архив', icon: 'archive' },
  { path: '/settings', label: 'Настройки', icon: 'sliders', adminOnly: true },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly api = inject(RisksApi);
  protected readonly theme = inject(ThemeService);

  protected readonly nav = computed(() =>
    NAV.filter(
      (n) =>
        (!n.adminOnly || this.auth.isAdmin()) &&
        (!n.right || this.auth.can(n.right) || this.auth.isAdmin()),
    ),
  );
  protected readonly user = this.auth.user;
  protected readonly initials = computed(() => initials(this.user()?.fullName ?? ''));

  /** Approval requests waiting for this user (analytics 13, §6): refreshed on every navigation. */
  private readonly approvals = httpResource<ApprovalsPage>(() => {
    this.api.measuresChanged();
    return this.user() ? `${API}/approvals` : undefined;
  });
  protected readonly waiting = computed(() =>
    this.approvals.hasValue() ? this.approvals.value().pending.filter((x) => x.mine).length : 0,
  );

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.approvals.reload());
  }
}
