import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export const SETTINGS_TABS = [
  {
    path: 'users',
    name: 'Пользователи',
    note: 'Учётные записи, роли и блокировка. Email служит логином, вместо удаления пользователя блокируют.',
  },
  {
    path: 'roles',
    name: 'Роли и права',
    note: 'Шесть системных ролей и их права. Роль разрешает действие, а оргназначение задаёт, где.',
  },
  {
    path: 'structure',
    name: 'Структура',
    note: 'Дирекции, процессы, владельцы и объекты со стоимостью часа простоя.',
  },
  {
    path: 'guides',
    name: 'Справочники',
    note: 'Опасности и категории рисков. Записи не удаляются, а выключаются: связи с рисками сохраняются.',
  },
  {
    path: 'method',
    name: 'Методология',
    note: 'Метод «Матрица рисков» R = L × I: шкала вероятности и денежная шкала тяжести.',
  },
  {
    path: 'thresholds',
    name: 'Пороги',
    note: 'Уровни принятия рисков по R и пороги согласования мер по плановой стоимости.',
  },
  {
    path: 'import',
    name: 'Импорт',
    note: 'Загрузка рисков, пользователей и объектов из CSV по шаблону с проверкой строк.',
  },
] as const;

/** Section links shown in every settings page header. */
@Component({
  selector: 'app-settings-tabs',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="tabs" aria-label="Разделы настроек">
      @for (t of tabs; track t.path) {
        <a
          class="tab"
          [routerLink]="['/settings', t.path]"
          routerLinkActive="on"
          ariaCurrentWhenActive="page"
          >{{ t.name }}</a
        >
      }
    </nav>
  `,
  styles: `
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px;
      border-radius: var(--r-pill);
      background: var(--hero-soft-bg);
      border: 1px solid var(--hero-soft-border);
    }
    .tab {
      height: 32px;
      padding: 0 14px;
      display: inline-flex;
      align-items: center;
      border-radius: var(--r-pill);
      color: var(--hero-fg);
      font-size: var(--fs-md);
      text-decoration: none;
    }
    .tab.on {
      background: var(--hero-active-bg);
      color: var(--hero-active-fg);
      font-weight: 500;
    }
  `,
})
export class SettingsTabs {
  protected readonly tabs = SETTINGS_TABS;
}

export function noteOf(path: (typeof SETTINGS_TABS)[number]['path']): string {
  return SETTINGS_TABS.find((t) => t.path === path)!.note;
}
