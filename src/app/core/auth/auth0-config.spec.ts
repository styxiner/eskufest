import { TEST_CONFIG } from '../../../testing/auth.mocks';
import { appBaseUrl, AUTH0_SCOPES, buildAuth0Config } from './auth0-config';

describe('buildAuth0Config', () => {
  const config = buildAuth0Config(TEST_CONFIG, 'https://album.test.example/');

  it('requests access tokens for our API audience with minimal scopes', () => {
    expect(config.authorizationParams).toEqual({
      audience: 'https://api.test.example',
      scope: 'openid profile email',
      redirect_uri: 'https://album.test.example/',
    });
    expect(AUTH0_SCOPES).not.toContain('offline_access'); // the SDK adds it itself for refresh tokens
  });

  it('keeps tokens in memory and uses rotating refresh tokens', () => {
    expect(config.cacheLocation).toBe('memory');
    expect(config.useRefreshTokens).toBe(true);
  });

  it('never ships a client secret', () => {
    expect(JSON.stringify(config).toLowerCase()).not.toContain('secret');
  });

  it('only attaches tokens to the API', () => {
    expect(config.httpInterceptor?.allowedList).toEqual([
      expect.objectContaining({ uri: 'https://api.test.example/api/*' }),
    ]);
  });
});

describe('appBaseUrl', () => {
  it('strips query and hash from the base URI', () => {
    const doc = { baseURI: 'https://album.test.example/?code=abc&state=xyz#/album' } as Document;
    expect(appBaseUrl(doc)).toBe('https://album.test.example/');
  });
});
