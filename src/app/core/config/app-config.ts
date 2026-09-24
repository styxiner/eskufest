import { InjectionToken, Provider } from '@angular/core';

/**
 * Public, non-secret runtime configuration. Everything here is visible in the bundle.
 */
export interface AppConfig {
  /** Auth0 (custom) domain, host only. */
  auth0Domain: string;
  /** Public client id of the Auth0 SPA application. */
  auth0ClientId: string;
  /** Audience (identifier) of the Auth0 API protecting the Worker. */
  auth0Audience: string;
  /** Base URL of the Worker API, without trailing slash. */
  apiUrl: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export function provideAppConfig(config: AppConfig): Provider {
  return { provide: APP_CONFIG, useValue: Object.freeze({ ...config }) };
}

/** True when the app was built with the placeholders of scripts/generate-config.mjs. */
export function isPlaceholderConfig(config: AppConfig): boolean {
  return config.auth0Domain.endsWith('.invalid') || new URL(config.apiUrl).hostname.endsWith('.invalid');
}
