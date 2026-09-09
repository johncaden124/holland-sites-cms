import { describe, expect, it } from 'vitest';
import { mediaOrigins, parseMediaHost, parsePayloadUrl } from '../src/mediaOrigins.js';

// `astro.config.mjs` is `.mjs` and reads its values with Vite's `loadEnv`, so it cannot be imported
// here the way `cms.ts` can. These are the pure functions it calls, tested directly.

describe('parsePayloadUrl', () => {
  it('accepts an https origin, a loopback origin and a sub-path mount', () => {
    expect(parsePayloadUrl('https://hub.hollandtech.com').origin).toBe('https://hub.hollandtech.com');
    expect(parsePayloadUrl('http://localhost:3000').port).toBe('3000');
    expect(parsePayloadUrl('https://hollandtech.com/hub').pathname).toBe('/hub');
  });

  it.each([
    ['hub.hollandtech.com', 'a bare hostname'],
    ['ftp://hub.test', 'a non-http(s) scheme'],
    ['/hub', 'a path'],
    ['https://hub.test?tenant=leapfly', 'a query string'],
    ['https://hub.test#admin', 'a fragment'],
  ])('rejects %s (%s) with the one documented message', (value) => {
    expect(() => parsePayloadUrl(value)).toThrow(
      `PAYLOAD_URL must be an absolute origin, e.g. https://hub.hollandtech.com (got "${value}")`,
    );
  });
});

describe('parseMediaHost', () => {
  it('defaults to the hub media domain', () => {
    expect(parseMediaHost(undefined)).toBe('media.hollandtech.com');
    expect(parseMediaHost('')).toBe('media.hollandtech.com');
  });

  it.each(['https://media.hollandtech.com', 'media.hollandtech.com:8080', 'media.hollandtech.com/files'])(
    'rejects "%s", which is not a bare hostname',
    (value) => {
      expect(() => parseMediaHost(value)).toThrow(
        `PUBLIC_MEDIA_HOST must be a bare hostname (no scheme, port or path), got "${value}"`,
      );
    },
  );
});

describe('mediaOrigins', () => {
  it('allows only https on PUBLIC_MEDIA_HOST for a remote hub', () => {
    const origins = mediaOrigins({ payloadUrl: 'https://hub.hollandtech.com', mediaHost: undefined });
    expect(origins.remotePatterns).toStrictEqual([
      { protocol: 'https', hostname: 'media.hollandtech.com', port: '' },
    ]);
    expect(origins.describe()).toBe('https://media.hollandtech.com');
    expect(origins.isAllowedMediaUrl('https://media.hollandtech.com/x.jpg')).toBe(true);
    // The bug this module exists for: same hostname, no TLS — `remotePatterns` would not match it.
    expect(origins.isAllowedMediaUrl('http://media.hollandtech.com/x.jpg')).toBe(false);
    expect(origins.isAllowedMediaUrl('https://evil.example/x.jpg')).toBe(false);
    expect(origins.isAllowedMediaUrl('http://localhost:3000/x.jpg')).toBe(false);
    expect(origins.isAllowedMediaUrl('/x.jpg')).toBe(false);
  });

  it('allows both spellings of loopback on a loopback hub’s own port, and no other port', () => {
    const origins = mediaOrigins({ payloadUrl: 'http://localhost:3000', mediaHost: undefined });
    expect(origins.remotePatterns).toStrictEqual([
      { protocol: 'http', hostname: 'localhost', port: '3000' },
      { protocol: 'http', hostname: '127.0.0.1', port: '3000' },
    ]);
    expect(origins.describe()).toBe('http://localhost:3000 or http://127.0.0.1:3000');
    expect(origins.isAllowedMediaUrl('http://localhost:3000/api/media/file/hero.jpg')).toBe(true);
    expect(origins.isAllowedMediaUrl('http://127.0.0.1:3000/api/media/file/hero.jpg')).toBe(true);
    // A hub on 3000 whose media is served from another port is not covered by `remotePatterns`.
    expect(origins.isAllowedMediaUrl('http://localhost:3001/api/media/file/hero.jpg')).toBe(false);
    expect(origins.isAllowedMediaUrl('https://localhost:3000/api/media/file/hero.jpg')).toBe(false);
    expect(origins.isAllowedMediaUrl('https://media.hollandtech.com/x.jpg')).toBe(false);
  });

  it('treats an https hub on loopback as remote (only TLS-less dev hubs serve their own media)', () => {
    const origins = mediaOrigins({ payloadUrl: 'https://localhost:3000', mediaHost: 'media.example.com' });
    expect(origins.describe()).toBe('https://media.example.com');
    expect(origins.isAllowedMediaUrl('https://localhost:3000/x.jpg')).toBe(false);
  });

  it('validates PUBLIC_MEDIA_HOST and PAYLOAD_URL through the shared rules', () => {
    expect(() => mediaOrigins({ mediaHost: 'https://media.example.com' })).toThrow(/bare hostname/);
    expect(() => mediaOrigins({ payloadUrl: 'hub.hollandtech.com' })).toThrow(/absolute origin/);
  });
});
