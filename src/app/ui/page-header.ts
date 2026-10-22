import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { ROLE_NAMES } from '../core/models';
import { Icon } from './icon';

/** Page hero: breadcrumbs, global search, user chip, page title. Page actions go in the content slot. */
@Component({
  selector: 'ui-page-header',
  imports: [Icon],
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
})
export class PageHeader {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly title = input.required<string>();
  readonly crumbs = input<string[]>([]);
  readonly subtitle = input('');

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

/** "Белов Александр Николаевич" → "АБ" (first name, then last name, as in the prototype). */
export function initials(fullName: string): string {
  const [last = '', first = ''] = fullName.split(' ');
  return (first[0] ?? '') + (last[0] ?? '');
}
