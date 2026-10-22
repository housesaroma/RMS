import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { USE_MOCKS } from './core/api';
import { AuthService, authInterceptor } from './core/auth';
import { mockApi } from './core/mock/mock-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors(USE_MOCKS ? [authInterceptor, mockApi] : [authInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    provideAppInitializer(() => inject(AuthService).restore()),
  ],
};
