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
      section('dashboard', 'Дашборд', [ROOT, 'Дашборд']),
      section('risks', 'Реестр рисков', ['Риски']),
      section('archive', 'Архив', [ROOT, 'Архив']),
      { ...section('settings', 'Настройки', [ROOT, 'Настройки']), canMatch: [roleGuard('ADMIN')] },
    ],
  },
  { path: '**', redirectTo: '' },
];
