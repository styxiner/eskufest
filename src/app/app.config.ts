import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withHashLocation } from '@angular/router';
import { authHttpInterceptorFn, provideAuth0 } from '@auth0/auth0-angular';

import { routes } from './app.routes';
import { apiErrorInterceptor } from './core/api/api-error.interceptor';
import { appBaseUrl, buildAuth0Config } from './core/auth/auth0-config';
import { provideAppConfig } from './core/config/app-config';
import { GENERATED_APP_CONFIG } from './core/config/app-config.generated';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppConfig(GENERATED_APP_CONFIG),
    provideAuth0(buildAuth0Config(GENERATED_APP_CONFIG, appBaseUrl(document))),
    // Hash routing: GitHub Pages has no server-side fallback for deep links.
    provideRouter(routes, withHashLocation()),
    // Default XHR backend (needed later for upload progress events).
    provideHttpClient(withInterceptors([apiErrorInterceptor, authHttpInterceptorFn])),
  ],
};
