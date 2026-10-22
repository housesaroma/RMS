import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth';
import { ThemeService } from '../../core/theme';
import { Icon, IconName } from '../../ui/icon';
import { initials } from '../../ui/page-header';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { path: '/dashboard', label: 'Дашборд', icon: 'grid' },
  { path: '/risks', label: 'Риски', icon: 'alert' },
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
  protected readonly theme = inject(ThemeService);

  protected readonly nav = computed(() => NAV.filter((n) => !n.adminOnly || this.auth.isAdmin()));
  protected readonly user = this.auth.user;
  protected readonly initials = computed(() => initials(this.user()?.fullName ?? ''));
}
