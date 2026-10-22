import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { initials } from '../core/format';
import { ROLE_NAMES } from '../core/models';
import { Icon } from './icon';

/** Page hero: breadcrumbs, global search, user chip, page title. Page actions go in the content slot. */
@Component({
  selector: 'ui-page-header',
  imports: [Icon, RouterLink],
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
})
export class PageHeader {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly title = input.required<string>();
  /** Plain labels or `{ label, link }` for clickable crumbs. */
  readonly crumbs = input<(string | { label: string; link: string })[]>([]);
  readonly subtitle = input('');
  /** Smaller title for long names, e.g. a risk card. */
  readonly compact = input(false);

  protected readonly user = this.auth.user;
  protected readonly initials = computed(() => initials(this.user()?.fullName ?? ''));
  protected readonly shortName = computed(() => {
    const [last, first] = (this.user()?.fullName ?? '').split(' ');
    return [first, last].filter(Boolean).join(' ');
  });
  protected readonly caption = computed(() => {
    const u = this.user();
    return u ? u.position || ROLE_NAMES[u.roles[0]] : '';
  });

  protected search(e: Event, q: string): void {
    e.preventDefault();
    if (q.trim()) this.router.navigate(['/risks'], { queryParams: { q: q.trim() } });
  }

  protected logout(): void {
    this.auth.logout();
  }
}
