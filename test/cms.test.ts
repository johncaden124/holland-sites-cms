/**
 * The fetch layer, end to end, against verbatim hub responses.
 *
 * Note what these tests no longer do: no `getViteConfig`, no `vi.stubEnv`, no `vi.resetModules`, no
 * `vi.doMock` of a config module. `createCms` takes its configuration as arguments and keeps its
 * caches in the closure, so a test is just a call — which is the whole reason the configuration is
 * arguments. The assertions themselves are unchanged, error strings included.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCms, type CmsOptions } from '../src/cms.js';
import { mapFaqs } from '../src/cms.map.js';
import type { HubFaqDoc } from '../src/cms.map.js';
import { local } from './local.js';
import hubFaqs from './__fixtures__/hub-faqs.json' with { type: 'json' };
import hubSite from './__fixtures__/hub-site.json' with { type: 'json' };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200, statusText = '') =>
  new Response(JSON.stringify(body), { status, statusText, headers: { 'content-type': 'application/json' } });

/** The options a hub-triggered build passes. */
const hub = (payloadUrl = 'http://hub.test', extra: Partial<CmsOptions> = {}): CmsOptions => ({
  payloadUrl,
  apiKey: 'not-a-real-key',
  mediaHost: 'media.hollandtech.com',
  cmsRequired: false,
  local,
  ...extra,
});

/** The options a standalone template build passes. */
const standalone = (extra: Partial<CmsOptions> = {}): CmsOptions => ({ cmsRequired: false, local, ...extra });

const FAQS_URL = 'http://hub.test/api/faqs?depth=1&limit=100&sort=order';

/** What `mapFaqs` makes of the captured hub response — the fetch layer's expected output. */
const faqs = mapFaqs(hubFaqs.docs as HubFaqDoc[]);

/** A `fetch` rejection shaped like undici's: `TypeError: fetch failed` carrying the socket error. */
const refused = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });

describe('cms', () => {
  it('serves the local content when neither PAYLOAD_URL nor PAYLOAD_API_KEY is set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(standalone());
    expect(cms.cmsEnabled).toBe(false);
    expect(await cms.getSite()).toBe(local.site);
    expect(await cms.getServices()).toBe(local.services);
    expect(await cms.getProjects()).toBe(local.projects);
    expect(await cms.getTestimonials()).toBe(local.testimonials);
    expect(await cms.getProcess()).toBe(local.process);
    expect(await cms.getStats()).toBe(local.stats);
    expect(await cms.getFaqs()).toBe(local.faqs);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('cmsRequired (client repos)', () => {
    it('fails the build when neither variable is set', () => {
      expect(() => createCms(standalone({ cmsRequired: true }))).toThrow(
        'CMS_REQUIRED is set but PAYLOAD_URL / PAYLOAD_API_KEY are missing — this build would publish' +
          " the template's placeholder content. Set both (on BOTH the Production and Preview" +
          ' environments in Cloudflare Pages).',
      );
    });

    it('keeps the one-variable message, which names the actual mistake', () => {
      expect(() =>
        createCms({ payloadUrl: 'http://hub.test', cmsRequired: true, local }),
      ).toThrow('Set both PAYLOAD_URL and PAYLOAD_API_KEY, or neither.');
    });

    it('fetches from the hub as usual once both are set', async () => {
      const fetchMock = vi.fn(async () => json(hubFaqs));
      vi.stubGlobal('fetch', fetchMock);

      const cms = createCms(hub('http://hub.test', { cmsRequired: true }));
      expect(cms.cmsEnabled).toBe(true);
      expect(await cms.getFaqs()).toStrictEqual(faqs);
    });
  });

  it('refuses to load with only one of the two variables set', () => {
    expect(() => createCms({ payloadUrl: 'http://localhost:3000', cmsRequired: false, local })).toThrow(
      /PAYLOAD_URL and PAYLOAD_API_KEY/,
    );
    expect(() => createCms({ apiKey: 'not-a-real-key', cmsRequired: false, local })).toThrow(
      /PAYLOAD_URL and PAYLOAD_API_KEY/,
    );
  });

  it('refuses a PAYLOAD_URL that is not an absolute http(s) origin, eagerly', () => {
    expect(() => createCms(hub('hub.hollandtech.com'))).toThrow(
      'PAYLOAD_URL must be an absolute origin, e.g. https://hub.hollandtech.com (got "hub.hollandtech.com")',
    );
    expect(() => createCms(hub('ftp://hub.test'))).toThrow(/PAYLOAD_URL must be an absolute origin/);
  });

  it('refuses an unusable PUBLIC_MEDIA_HOST eagerly, in a standalone build too', () => {
    expect(() => createCms(standalone({ mediaHost: 'https://media.example.com' }))).toThrow(
      'PUBLIC_MEDIA_HOST must be a bare hostname (no scheme, port or path), got "https://media.example.com"',
    );
  });

  it('fetches, authenticates, maps and caches when both are set (trailing slash tolerated)', async () => {
    const fetchMock = vi.fn(async () => json(hubFaqs));
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub('http://hub.test/'));
    expect(cms.cmsEnabled).toBe(true);
    expect(await cms.getFaqs()).toStrictEqual(faqs);
    await cms.getFaqs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      FAQS_URL,
      expect.objectContaining({
        headers: { authorization: 'users API-Key not-a-real-key' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('names the URL, Payload message and the API-key fix on a 401, without retrying', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ errors: [{ message: 'You are not allowed to perform this action.' }] }, 401))
      .mockResolvedValueOnce(json({ ...hubFaqs, docs: [], totalDocs: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub());
    await expect(cms.getStats()).rejects.toThrow(
      'CMS stats: HTTP 401 from http://hub.test/api/stats?depth=1&limit=100&sort=order ' +
        '(You are not allowed to perform this action.) — check PAYLOAD_API_KEY is the build-bot key for this tenant',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(cms.getFaqs()).rejects.toThrow(
      'CMS faqs: no documents for this tenant — create them in the hub admin',
    );
  });

  it('tells the operator to create the Site document when the site collection is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...hubSite, docs: [], totalDocs: 0 })));
    const cms = createCms(hub());
    await expect(cms.getSite()).rejects.toThrow(
      'CMS site: no documents for this tenant — create the Site document for this tenant',
    );
  });

  it('retries a 5xx once and then succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ errors: [{ message: 'Something went wrong.' }] }, 503, 'Service Unavailable'))
      .mockResolvedValueOnce(json(hubFaqs));
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub());
    const result = cms.getFaqs();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toStrictEqual(faqs);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a persistent 5xx with its status text and URL', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => json({}, 502, 'Bad Gateway'));
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub());
    const result = cms.getFaqs();
    result.catch(() => {});
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).rejects.toThrow(`CMS faqs: HTTP 502 Bad Gateway from ${FAQS_URL}`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('names the URL and the socket error when the hub is unreachable, after one retry', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(refused());
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub());
    const result = cms.getFaqs();
    result.catch(() => {});
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).rejects.toThrow(`CMS faqs: could not reach ${FAQS_URL} (ECONNREFUSED) — check PAYLOAD_URL`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports the 20 s deadline in words when the hub accepts the connection but never answers', async () => {
    vi.useFakeTimers();
    const timeout = () =>
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const fetchMock = vi.fn().mockRejectedValue(timeout());
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub());
    const result = cms.getFaqs();
    result.catch(() => {});
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).rejects.toThrow(
      `CMS faqs: could not reach ${FAQS_URL} (no response in 20 s) — check PAYLOAD_URL`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('names the collection and URL when the response body dies mid-read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const res = json(hubFaqs);
        vi.spyOn(res, 'text').mockRejectedValue(
          Object.assign(new TypeError('terminated'), { cause: { code: 'UND_ERR_SOCKET' } }),
        );
        return res;
      }),
    );
    const cms = createCms(hub());
    await expect(cms.getFaqs()).rejects.toThrow(
      `CMS faqs: could not reach ${FAQS_URL} (UND_ERR_SOCKET) — check PAYLOAD_URL`,
    );
  });

  it('refetches after a second in dev, so `astro dev` picks up saved content on reload', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => json(hubFaqs));
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub('http://hub.test', { dev: true }));
    await cms.getFaqs();
    await vi.advanceTimersByTimeAsync(2_000);
    await cms.getFaqs();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps one fetch per collection for a whole build', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => json(hubFaqs));
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub('http://hub.test', { dev: false }));
    await cms.getFaqs();
    await vi.advanceTimersByTimeAsync(2_000);
    await cms.getFaqs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps and checks the site document once however many components ask for it', async () => {
    const fetchMock = vi.fn(async () => json(hubSite));
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub('http://localhost:3000'));
    const first = await cms.getSite();
    expect(await cms.getSite()).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recovers when only the first attempt is refused', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValueOnce(refused()).mockResolvedValueOnce(json(hubFaqs));
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub());
    const result = cms.getFaqs();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toStrictEqual(faqs);
  });

  it('evicts a failed fetch so the next caller retries instead of replaying the rejection', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json(hubFaqs));
    vi.stubGlobal('fetch', fetchMock);

    const cms = createCms(hub());
    await expect(cms.getFaqs()).rejects.toThrow(`CMS faqs: HTTP 404 from ${FAQS_URL}`);
    expect(await cms.getFaqs()).toStrictEqual(faqs);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives two createCms instances their own caches, so one build never sees another', async () => {
    const fetchMock = vi.fn(async () => json(hubFaqs));
    vi.stubGlobal('fetch', fetchMock);

    await createCms(hub()).getFaqs();
    await createCms(hub()).getFaqs();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('explains a non-Payload response (an HTML page, say) instead of crashing on it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('<!doctype html><title>Welcome</title>', { headers: { 'content-type': 'text/html' } }),
      ),
    );
    const cms = createCms(hub());
    await expect(cms.getFaqs()).rejects.toThrow(
      `CMS faqs: ${FAQS_URL} did not return a Payload list (content-type text/html) — is PAYLOAD_URL the hub origin?`,
    );
  });

  it('refuses a paginated collection rather than silently dropping documents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...hubFaqs, hasNextPage: true })));
    const cms = createCms(hub());
    await expect(cms.getFaqs()).rejects.toThrow(
      'CMS faqs: more than 100 documents; raise PAGE_LIMIT in @hollandtech/site-cms',
    );
  });

  describe('tenant scoping', () => {
    /** The build is scoped only by the API key; these are the responses a wrongly scoped key gets. */
    const site = hubSite.docs[0];
    const faq = hubFaqs.docs[0];
    /** The tenant the demo hub seeds; read off the capture so it survives a reseed. */
    const tenant = faq!.tenant;

    it('refuses a site collection with more than one document', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => json({ ...hubSite, docs: [site, { ...site, id: 999 }] })));
      const cms = createCms(hub());
      await expect(cms.getSite()).rejects.toThrow(
        'CMS site: expected exactly 1 document for this tenant, got 2' +
          ' — is PAYLOAD_API_KEY a build-bot key scoped to one tenant?',
      );
    });

    it('refuses a list whose documents come from two tenants, naming both', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => json({ ...hubFaqs, docs: [faq, { ...faq, id: 998, tenant: 7 }] })));
      const cms = createCms(hub());
      await expect(cms.getFaqs()).rejects.toThrow(
        `CMS faqs: documents from more than one tenant (${tenant}, 7)` +
          ' — is PAYLOAD_API_KEY a build-bot key scoped to one tenant?',
      );
    });

    it('reads the tenant off a populated relation as well as a bare id', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          json({
            ...hubFaqs,
            docs: [
              { ...faq, tenant: { id: tenant, name: 'Demo tenant' } },
              { ...faq, id: 998, tenant: { id: 7, name: 'Someone else' } },
            ],
          }),
        ),
      );
      const cms = createCms(hub());
      await expect(cms.getFaqs()).rejects.toThrow(`CMS faqs: documents from more than one tenant (${tenant}, 7)`);
    });

    it('catches a tenant that changes between collections, not just within one', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) =>
          json(url.includes('/faqs') ? { ...hubFaqs, docs: hubFaqs.docs.map((d) => ({ ...d, tenant: 7 })) } : hubSite),
        ),
      );
      const cms = createCms(hub('http://localhost:3000'));
      await cms.getSite();
      await expect(cms.getFaqs()).rejects.toThrow(`CMS faqs: documents from more than one tenant (${tenant}, 7)`);
    });

    it('accepts the single-tenant response the hub actually serves', async () => {
      vi.stubGlobal('fetch', vi.fn(async (url: string) => json(url.includes('/faqs') ? hubFaqs : hubSite)));
      const cms = createCms(hub('http://localhost:3000'));
      await cms.getSite();
      expect(await cms.getFaqs()).toStrictEqual(faqs);
    });
  });

  describe('media host', () => {
    const withPoster = (url: string) => {
      const doc = hubSite.docs[0]!;
      return { ...hubSite, docs: [{ ...doc, heroPoster: { ...doc.heroPoster, url } }] };
    };
    /** The hero video is asserted before the walk reaches the poster; park it on the media host. */
    const withRemoteVideo = (posterUrl: string) => {
      const doc = withPoster(posterUrl).docs[0]!;
      return {
        ...hubSite,
        docs: [{ ...doc, heroVideo: { ...doc.heroVideo, url: 'https://media.hollandtech.com/hero.mp4' } }],
      };
    };

    it('accepts loopback media from a loopback hub', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => json(hubSite)));
      const cms = createCms(hub('http://localhost:3000'));
      expect((await cms.getSite()).hero.poster.src).toBe('http://localhost:3000/api/media/file/hero-poster.jpg');
    });

    it('accepts the other spelling of loopback on the hub’s port', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => json(withPoster('http://127.0.0.1:3000/api/media/file/p.jpg'))));
      const cms = createCms(hub('http://localhost:3000'));
      expect((await cms.getSite()).hero.poster.src).toBe('http://127.0.0.1:3000/api/media/file/p.jpg');
    });

    it('rejects loopback media on a port `remotePatterns` does not cover', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => json(withPoster('http://localhost:3001/api/media/file/p.jpg'))));
      const cms = createCms(hub('http://localhost:3000'));
      await expect(cms.getSite()).rejects.toThrow(
        'CMS site.hero.poster: media URL http://localhost:3001/api/media/file/p.jpg is not an allowed image origin' +
          ' (expected http://localhost:3000 or http://127.0.0.1:3000) — Astro would ship it unoptimised',
      );
    });

    it('rejects a photo on any other host, naming the field', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => json(withPoster('https://evil.example/x.jpg'))));
      const cms = createCms(hub('http://localhost:3000'));
      await expect(cms.getSite()).rejects.toThrow(
        'CMS site.hero.poster: media URL https://evil.example/x.jpg is not an allowed image origin' +
          ' (expected http://localhost:3000 or http://127.0.0.1:3000) — Astro would ship it unoptimised',
      );
    });

    it('rejects the media host without TLS, which `remotePatterns` would not match either', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => json(withRemoteVideo('http://media.hollandtech.com/x.jpg'))));
      const cms = createCms(hub('https://hub.hollandtech.com'));
      await expect(cms.getSite()).rejects.toThrow(
        'CMS site.hero.poster: media URL http://media.hollandtech.com/x.jpg is not an allowed image origin' +
          ' (expected https://media.hollandtech.com) — Astro would ship it unoptimised',
      );
    });

    it('rejects loopback media once the hub is not on loopback (the hero video is checked too)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => json(hubSite)));
      const cms = createCms(hub('https://hub.hollandtech.com'));
      await expect(cms.getSite()).rejects.toThrow(
        'CMS site.hero.video: media URL http://localhost:3000/api/media/file/hero.mp4 is not an allowed image origin' +
          ' (expected https://media.hollandtech.com) — Astro would ship it unoptimised',
      );
    });

    it('rejects a relative media URL by name', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => json(withPoster('/api/media/file/hero-poster.jpg'))));
      const cms = createCms(hub('http://localhost:3000'));
      await expect(cms.getSite()).rejects.toThrow(
        'CMS site.hero.poster: media URL "/api/media/file/hero-poster.jpg" is not absolute',
      );
    });
  });

  describe('warnMissingIcon', () => {
    it('warns once per icon per build, through the injected warn', () => {
      const warn = vi.fn();
      const cms = createCms(standalone({ warn }));
      cms.warnMissingIcon('rodent');
      cms.warnMissingIcon('rodent');
      cms.warnMissingIcon('faucet');
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenNthCalledWith(
        1,
        'ServiceIcon: no artwork for "rodent" in this template — rendering the placeholder glyph.' +
          ' Draw it in src/components/ui/ServiceIcon.astro or pick a drawn icon in the CMS.',
      );
    });

    it('defaults to console.warn', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createCms(standalone()).warnMissingIcon('pest');
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
