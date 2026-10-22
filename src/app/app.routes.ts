import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth';

const ROOT = 'Система управления рисками';

const section = (path: string, heading: string, crumbs: string[]) => ({
  path,
  title: `${heading} · СУР`,
  loadComponent: () => import('./features/placeholder').then((m) => m.Placeholder),
  data: { heading, crumbs },
});

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
      section('archive', 'Архив', [ROOT, 'Архив']),
      { ...section('settings', 'Настройки', [ROOT, 'Настройки']), canMatch: [roleGuard('ADMIN')] },
    ],
  },
  { path: '**', redirectTo: '' },
];
