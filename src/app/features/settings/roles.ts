import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { AdminApi } from '../../core/admin-api';
import { errorMessage } from '../../core/api';
import { downloadCsv } from '../../core/csv';
import { Right, Role } from '../../core/models';
import { Icon } from '../../ui/icon';
import { PageHeader } from '../../ui/page-header';
import { SettingsTabs, noteOf } from './settings-tabs';

const RULES = [
  [
    'Права складываются',
    'У пользователя может быть несколько ролей: действует объединение их прав.',
  ],
  [
    'Роль разрешает, контекст ограничивает',
    'Право владельца действует в его процессах, директора — в его дирекции, CEO — во всей компании.',
  ],
  [
    'Просмотр без ограничений',
    'Право view_risk открывает все риски независимо от дирекции и процессов.',
  ],
  [
    'Риск-менеджер = права CEO',
    'RISK_SPECIALIST получает набор CEO, но в журнале отображается как риск-менеджер.',
  ],
  ['ADMIN неизменяем', 'Роль ADMIN нельзя выключить, а её право admin нельзя снять.'],
  [
    'Активная роль обязательна',
    'Роль нельзя выключить, если у пользователя не останется других активных ролей.',
  ],
];

@Component({
  selector: 'app-settings-roles',
  imports: [PageHeader, SettingsTabs, Icon],
  templateUrl: './roles.html',
  styleUrl: './settings.scss',
  styles: `
    .layout {
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr);
      gap: var(--gap);
      align-items: start;
    }
    .role {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      padding: 14px 16px;
      border-radius: 20px;
      border: 1px solid transparent;
      background: var(--inner-bg);
      text-align: left;
      cursor: pointer;
    }
    .role.sel {
      border-color: var(--accent);
    }
    .role.off {
      opacity: 0.6;
    }
    .mx th:not(:first-child),
    .mx td:not(:first-child) {
      text-align: center;
      width: 92px;
    }
    .mx th.sel,
    .mx td.sel {
      background: color-mix(in srgb, var(--accent) 8%, transparent);
    }
    .cell {
      width: 28px;
      height: 28px;
      border-radius: 9px;
      border: 1px dashed var(--line);
      background: transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .cell.on {
      background: var(--nav-active-bg);
      color: var(--nav-active-fg);
      border: 0;
    }
    .cell.dirty {
      box-shadow: 0 0 0 2px var(--cta-bg);
    }
    .cell:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .group td {
      font-size: var(--fs-xs);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      background: var(--inner-bg);
    }
    code {
      margin-left: 8px;
      font-size: var(--fs-xs);
      color: var(--muted);
    }
    .rules {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .rule {
      display: flex;
      gap: 12px;
      padding: 14px;
      border-radius: 18px;
      background: var(--inner-bg);
    }
    .rule b {
      font-size: 24px;
      font-weight: 200;
    }
    @media (max-width: 1100px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class Roles {
  private readonly api = inject(AdminApi);
  protected readonly note = noteOf('roles');
  protected readonly data = this.api.roles();
  protected readonly rules = RULES;

  /** Editable copies of the matrix and role switches; reset whenever the server data reloads. */
  protected readonly matrix = linkedSignal(() =>
    structuredClone(this.data.value()?.matrix ?? null),
  );
  protected readonly active = linkedSignal(
    () =>
      Object.fromEntries((this.data.value()?.roles ?? []).map((r) => [r.code, r.active])) as Record<
        Role,
        boolean
      >,
  );
  protected readonly selected = signal<Role | null>(null);
  protected readonly q = signal('');
  protected readonly showCodes = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);

  protected readonly groups = computed(() => {
    const q = this.q().trim().toLowerCase();
    const rights = (this.data.value()?.rights ?? []).filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.code.includes(q),
    );
    return [...new Set(rights.map((r) => r.group))].map((g) => ({
      name: g,
      rights: rights.filter((r) => r.group === g),
    }));
  });

  protected readonly dirty = computed(() => {
    const d = this.data.value();
    if (!d || !this.matrix()) return false;
    return (
      JSON.stringify(this.matrix()) !== JSON.stringify(d.matrix) ||
      d.roles.some((r) => r.active !== this.active()[r.code])
    );
  });

  protected has(role: Role, right: Right): boolean {
    return this.matrix()?.[role]?.includes(right) ?? false;
  }

  protected changed(role: Role, right: Right): boolean {
    return this.has(role, right) !== (this.data.value()?.matrix[role]?.includes(right) ?? false);
  }

  protected toggle(role: Role, right: Right): void {
    if (role === 'ADMIN') return;
    this.matrix.update((m) => {
      const next = structuredClone(m)!;
      next[role] = next[role].includes(right)
        ? next[role].filter((x) => x !== right)
        : [...next[role], right];
      return next;
    });
  }

  protected toggleActive(role: Role): void {
    if (role === 'ADMIN') return;
    this.active.update((a) => ({ ...a, [role]: !a[role] }));
  }

  protected rightsCount(role: Role): number {
    return this.matrix()?.[role]?.length ?? 0;
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.saveRoles(this.matrix()!, this.active());
      this.notice.set({
        text: 'Права сохранены. Они действуют со следующего запроса пользователя.',
        error: false,
      });
      this.data.reload();
    } catch (e) {
      this.notice.set({ text: errorMessage(e), error: true });
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel(): void {
    this.data.reload();
  }

  protected exportMatrix(): void {
    const d = this.data.value();
    if (!d) return;
    downloadCsv(
      'rights-matrix',
      ['Право', 'Код', ...d.roles.map((r) => r.code)],
      d.rights.map((x) => [
        x.name,
        x.code,
        ...d.roles.map((r) => (d.matrix[r.code].includes(x.code) ? 'да' : '')),
      ]),
    );
  }
}
