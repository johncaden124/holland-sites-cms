/**
 * The single definition of which origins may serve a site's images, shared by the two places that
 * must agree about it:
 *
 * - the consumer's `astro.config.mjs` turns it into `image.remotePatterns`, which decides what
 *   `astro:assets` will actually download and optimise;
 * - `cms.ts` turns it into the build-time assertion that every hub media URL is one of them,
 *   because a URL Astro does not match is shipped raw with no error.
 *
 * If those two drifted, the assertion would pass images that Astro then silently ships
 * unoptimised — the exact failure the assertion exists to prevent. So both callers read the
 * origins from here, and both compare protocol, hostname *and* port.
 *
 * This module never touches `import.meta.env` or `process.env` — nothing in this package does, and
 * for good reason: the package is `"astro": { "external": true }`, so Vite never processes it and
 * never substitutes `import.meta.env`. `astro.config.mjs` reads its values with Vite's `loadEnv`
 * (it runs before Astro's env is available) and the site's `src/lib/cms.ts` reads
 * `import.meta.env`. Both pass what they read in explicitly.
 */

export const DEFAULT_MEDIA_HOST = 'media.hollandtech.com';

const LOOPBACK = ['localhost', '127.0.0.1'];

/** An origin `astro:assets` is allowed to fetch from, in `image.remotePatterns` shape. */
export interface MediaOrigin {
  protocol: 'http' | 'https';
  hostname: string;
  /** Empty string means "any port", matching Astro's own `remotePatterns` semantics. */
  port: string;
}

export interface MediaOriginsInput {
  /** `PAYLOAD_URL`, if set. A loopback dev hub serves its own media over http. */
  payloadUrl?: string | undefined;
  /** `PUBLIC_MEDIA_HOST`, if set. Defaults to `media.hollandtech.com`. */
  mediaHost?: string | undefined;
}

export interface MediaOrigins {
  /** Spread into `image.remotePatterns`. */
  remotePatterns: MediaOrigin[];
  /** True when `src` is an absolute URL whose protocol, hostname and port match one of them. */
  isAllowedMediaUrl(src: string): boolean;
  /** For error messages: the origins, as `https://host` / `http://host:port`. */
  describe(): string;
}

/**
 * `PAYLOAD_URL` parsed with one rule and one message, wherever it is read. A path is allowed
 * (Payload can be mounted on a sub-path); a query or fragment is not — it would be silently
 * dropped when `/api/...` is appended.
 */
export function parsePayloadUrl(value: string): URL {
  const parsed = URL.canParse(value) ? new URL(value) : undefined;
  if (!parsed || !/^https?:$/.test(parsed.protocol) || parsed.search || parsed.hash) {
    throw new Error(`PAYLOAD_URL must be an absolute origin, e.g. https://hub.hollandtech.com (got "${value}")`);
  }
  return parsed;
}

/** `PUBLIC_MEDIA_HOST` must be a bare hostname: it is interpolated into `https://<host>`. */
export function parseMediaHost(value: string | undefined): string {
  const host = value || DEFAULT_MEDIA_HOST;
  if (!URL.canParse(`https://${host}`) || new URL(`https://${host}`).hostname !== host) {
    throw new Error(`PUBLIC_MEDIA_HOST must be a bare hostname (no scheme, port or path), got "${host}"`);
  }
  return host;
}

const origin = (o: MediaOrigin) => `${o.protocol}://${o.hostname}${o.port ? `:${o.port}` : ''}`;

/**
 * The allowed image origins for this build.
 *
 * A hub on `http://localhost`/`http://127.0.0.1` serves its own media, so both spellings of
 * loopback are allowed on the hub's port and nowhere else. Otherwise media lives on
 * `https://<PUBLIC_MEDIA_HOST>`.
 */
export function mediaOrigins({ payloadUrl, mediaHost }: MediaOriginsInput): MediaOrigins {
  const hub = payloadUrl ? parsePayloadUrl(payloadUrl) : undefined;
  const host = parseMediaHost(mediaHost);
  const hubIsLoopback = !!hub && hub.protocol === 'http:' && LOOPBACK.includes(hub.hostname);

  const remotePatterns: MediaOrigin[] = hubIsLoopback
    ? LOOPBACK.map((hostname) => ({ protocol: 'http', hostname, port: hub.port }))
    : [{ protocol: 'https', hostname: host, port: '' }];

  return {
    remotePatterns,
    isAllowedMediaUrl(src) {
      if (!URL.canParse(src)) return false;
      const url = new URL(src);
      return remotePatterns.some(
        (p) =>
          `${p.protocol}:` === url.protocol &&
          p.hostname === url.hostname &&
          // Astro's own `matchPort`: an empty pattern port matches any port.
          (p.port === '' || p.port === url.port),
      );
    },
    describe: () => remotePatterns.map(origin).join(' or '),
  };
}
