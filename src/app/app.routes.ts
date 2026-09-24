import { Routes } from '@angular/router';
import { approvedGuard, redirectAuthenticatedGuard } from './core/auth/approved.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [redirectAuthenticatedGuard],
    title: 'Iniciar sesión · Álbum',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'album',
    canActivate: [approvedGuard],
    title: 'Álbum',
    loadComponent: () => import('./pages/album/album').then((m) => m.AlbumPage),
  },
  {
    path: 'pending',
    title: 'Pendiente de aprobación · Álbum',
    loadComponent: () => import('./pages/pending/pending').then((m) => m.PendingPage),
  },
  {
    path: 'auth-error',
    title: 'Error de inicio de sesión · Álbum',
    loadComponent: () => import('./pages/auth-error/auth-error').then((m) => m.AuthErrorPage),
  },
  {
    path: 'error',
    title: 'Error · Álbum',
    loadComponent: () => import('./pages/error/error').then((m) => m.ErrorPage),
  },
  { path: '**', redirectTo: '' },
];
