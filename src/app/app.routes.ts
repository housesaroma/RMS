import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Вход · СУР',
    canMatch: [guestGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Дашборд · СУР',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'risks',
        title: 'Реестр рисков · СУР',
        loadComponent: () => import('./features/risks/risks').then((m) => m.Risks),
      },
      {
        path: 'risks/:id',
        title: 'Карточка риска · СУР',
        loadComponent: () => import('./features/risk-card/risk-card').then((m) => m.RiskCard),
      },
      {
        path: 'measures',
        title: 'Меры · СУР',
        loadComponent: () => import('./features/measures/measures').then((m) => m.Measures),
      },
      {
        path: 'reports',
        title: 'Отчёты · СУР',
        loadComponent: () => import('./features/reports/reports').then((m) => m.Reports),
      },
      {
        path: 'archive',
        title: 'Архив · СУР',
        loadComponent: () => import('./features/archive/archive').then((m) => m.Archive),
      },
      {
        path: 'settings',
        canMatch: [roleGuard('ADMIN')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'users' },
          {
            path: 'users',
            title: 'Пользователи · Настройки · СУР',
            loadComponent: () => import('./features/settings/users').then((m) => m.Users),
          },
          {
            path: 'roles',
            title: 'Роли и права · Настройки · СУР',
            loadComponent: () => import('./features/settings/roles').then((m) => m.Roles),
          },
          {
            path: 'structure',
            title: 'Структура · Настройки · СУР',
            loadComponent: () => import('./features/settings/structure').then((m) => m.Structure),
          },
          {
            path: 'guides',
            title: 'Справочники · Настройки · СУР',
            loadComponent: () => import('./features/settings/guides').then((m) => m.Guides),
          },
          {
            path: 'method',
            title: 'Методология · Настройки · СУР',
            loadComponent: () => import('./features/settings/method').then((m) => m.Method),
          },
          {
            path: 'thresholds',
            title: 'Пороги · Настройки · СУР',
            loadComponent: () => import('./features/settings/thresholds').then((m) => m.Thresholds),
          },
          {
            path: 'import',
            title: 'Импорт · Настройки · СУР',
            loadComponent: () => import('./features/settings/import').then((m) => m.Import),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
