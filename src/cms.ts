/**
 * Content source for a template's pages. Given a `PAYLOAD_URL` + `PAYLOAD_API_KEY` (a hub-triggered
 * build), every getter fetches the tenant's documents from the hub REST API and maps them with
 * `cms.map.ts`; given neither, they return the template's own `src/data` unchanged. Setting only one
 * is a misconfiguration and fails the build, and so does setting neither with `cmsRequired: true`
 * (every client repo).
 *
 * Caching: in dev, reload to refetch; in build, one fetch per collection. A failed fetch is
 * evicted so the next caller retries rather than replaying the same rejection. The cache lives in
 * the closure, so two `createCms` calls never share content — which is also why the tests need no
 * module resets.
 *
 * ## Why everything is an argument
 *
 * This package is published with `"astro": { "external": true }`, so Vite never processes it and
 * never substitutes `import.meta.env`; the `bin/` scripts run in plain Node, where it does not
 * exist at all. Nothing in this package may read ambient configuration. The consumer's
 * `src/lib/cms.ts` reads `import.meta.env` and passes what it read to `createCms`.
 *
 * ## Why validation is eager
 *
 * A template calls `createCms` at module scope, so throwing here is throwing at import — the same
 * moment, and the same words, as when this code lived in the template. Deferring the checks into
 * the getters would turn a misconfigured Cloudflare Pages build from "fails immediately, naming the
 * variable" into "renders half a page, then fails somewhere else".
 *
 * Every error here is the operator's whole experience of a failed build, so each one names the
 * collection or field, the URL it hit, and the fix. The API key is never printed.
 */
import { mediaOrigins, parsePayloadUrl } from './mediaOrigins.js';
import {
  mapFaqs,
  mapProcess,
  mapProjects,
  mapServices,
  mapSite,
  mapStats,
  mapTestimonials,
  type HubFaqDoc,
  type HubProcessStepDoc,
  type HubProjectDoc,
  type HubServiceDoc,
  type HubSiteDoc,
  type HubStatDoc,
  type HubTestimonialDoc,
} from './cms.map.js';
import type {
  Faq,
  GalleryImage,
  LocalContent,
  ProcessStep,
  Service,
  ServiceIcon,
  SiteContent,
  Stat,
  Testimonial,
} from './types.js';

// ---- the collections, and the one place their URLs are built ---------------------------------

/**
 * Every collection a site build reads, in the order the hub lists them. `bin/site-cms.mjs
 * capture-fixtures` walks this list and calls `collectionUrl` too, so a captured fixture is
 * byte-for-byte what the fetch layer below would have received.
 */
export const COLLECTIONS = [
  'site',
  'services',
  'projects',
  'testimonials',
  'process-steps',
  'stats',
  'faqs',
] as const;

/** Payload's page size. A collection larger than this is refused rather than silently truncated. */
const PAGE_LIMIT = 100;

/** The exact request a build makes for one collection. */
export const collectionUrl = (base: string, collection: string): string =>
  `${base.replace(/\/+$/, '')}/api/${collection}?depth=1&limit=${PAGE_LIMIT}&sort=order`;

const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1_000;

// ---- options and result ------------------------------------------------------------------------

export interface CmsOptions {
  /** `PAYLOAD_URL`. Absent (with `apiKey` absent too) selects the local content. */
  payloadUrl?: string | undefined;
  /** `PAYLOAD_API_KEY`, the build-bot key scoped to one tenant. Never printed. */
  apiKey?: string | undefined;
  /** `PUBLIC_MEDIA_HOST`. Defaults to `media.hollandtech.com`. */
  mediaHost?: string | undefined;
  /**
   * Does this repo's build *require* the hub? `false` in a template repo, which is a standalone
   * demo on purpose. **`true` in every client repo**: a client site must never publish the
   * template's placeholder content, and Cloudflare Pages scopes build variables to Production and
   * Preview separately, so setting them on one and not the other is a single missed click away.
   */
  cmsRequired: boolean;
  /** This template's own `src/data`, served whenever the hub is not configured. */
  local: LocalContent;
  /** `import.meta.env.DEV`. In dev the per-collection cache expires so a reload refetches. */
  dev?: boolean | undefined;
  /** Where build-time warnings go. Defaults to `console.warn`. */
  warn?: ((message: string) => void) | undefined;
}

export interface Cms {
  /** True when both `payloadUrl` and `apiKey` were given: the getters fetch from the hub. */
  readonly cmsEnabled: boolean;
  getSite(): Promise<SiteContent>;
  getServices(): Promise<Service[]>;
  getProjects(): Promise<GalleryImage[]>;
  getTestimonials(): Promise<Testimonial[]>;
  getProcess(): Promise<ProcessStep[]>;
  getStats(): Promise<Stat[]>;
  getFaqs(): Promise<Faq[]>;
  /**
   * Say once per build that this template draws no artwork for `icon`. The vocabulary is shared
   * across niches and deliberately wider than any one of them, so a missing glyph is a placeholder
   * and a warning, never a failed build. Call it from the template's `ServiceIcon.astro` when the
   * value is outside its own drawn set.
   */
  warnMissingIcon(icon: ServiceIcon | string): void;
}

// ---- factory -------------------------------------------------------------------------------

export function createCms(options: CmsOptions): Cms {
  const { payloadUrl: RAW_URL, apiKey: KEY, cmsRequired, local, dev = false } = options;
  const warn = options.warn ?? ((message: string) => console.warn(message));

  const cmsEnabled = !!(RAW_URL && KEY);
  if ((RAW_URL || KEY) && !cmsEnabled) {
    throw new Error('Set both PAYLOAD_URL and PAYLOAD_API_KEY, or neither.');
  }
  // A client repo sets `cmsRequired`: without it, a Pages project missing its variables would
  // publish the template's placeholder business on the client's domain, green.
  if (cmsRequired && !cmsEnabled) {
    throw new Error(
      'CMS_REQUIRED is set but PAYLOAD_URL / PAYLOAD_API_KEY are missing — this build would publish' +
        " the template's placeholder content. Set both (on BOTH the Production and Preview" +
        ' environments in Cloudflare Pages).',
    );
  }

  /**
   * `PAYLOAD_URL` parsed once, up front, so a typo fails before the first request, not inside it.
   * `mediaOrigins.ts` owns the rule, so `astro.config.mjs` — which the consumer evaluates first —
   * rejects the same values with the same words.
   */
  const HUB = cmsEnabled ? parsePayloadUrl(RAW_URL as string) : undefined;
  /** Base for `/api/...` requests: the configured URL minus any trailing slash. */
  const BASE = HUB?.href.replace(/\/+$/, '');

  /**
   * The image origins the consumer's `astro.config.mjs` puts in `image.remotePatterns`, from the
   * same module, so the assertion below cannot accept a URL Astro would refuse to optimise. Built
   * unconditionally: an unusable `mediaHost` is a mistake worth reporting in a standalone build too.
   */
  const ORIGINS = mediaOrigins({ payloadUrl: HUB?.href, mediaHost: options.mediaHost });

  // ---- fetching ---------------------------------------------------------------------------

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * A rejected `fetch` — DNS, refused connection, timeout — or a body that dies mid-read becomes a
   * named CMS error instead of undici's bare `TypeError: fetch failed` / `TypeError: terminated`.
   */
  function unreachable(collection: string, url: string, cause: unknown): Error {
    const err = cause as { name?: string; message?: string; cause?: { code?: string } };
    const reason =
      err.name === 'TimeoutError' ? `no response in ${TIMEOUT_MS / 1000} s` : (err.cause?.code ?? err.message);
    return new Error(`CMS ${collection}: could not reach ${url} (${reason}) — check PAYLOAD_URL`, { cause });
  }

  /** One attempt. The 20 s deadline covers the body too, so it stays armed until `res.text()`. */
  async function attempt(collection: string, url: string): Promise<Response> {
    try {
      return await fetch(url, {
        headers: { authorization: `users API-Key ${KEY}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      throw unreachable(collection, url, cause);
    }
  }

  /** Retries once, after a pause, on a network error or a 5xx; a 4xx is final. */
  async function request(collection: string, url: string): Promise<Response> {
    for (let n = 0; ; n++) {
      try {
        const res = await attempt(collection, url);
        if (res.status < 500 || n > 0) return res;
        // Discarded: release the socket rather than leaving the body unread until GC.
        res.body?.cancel().catch(() => {});
      } catch (err) {
        if (n > 0) throw err;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  /** Payload's error envelope, `{ errors: [{ message }] }`, when the body is one. */
  function payloadMessage(body: unknown): string | undefined {
    const first = (body as { errors?: { message?: unknown }[] } | null)?.errors?.[0]?.message;
    return typeof first === 'string' ? first : undefined;
  }

  // ---- tenant scoping -----------------------------------------------------------------------
  //
  // The build is scoped by one thing only: the build-bot key in `PAYLOAD_API_KEY`. Nothing in a
  // response says which tenant it *should* be, so if that key ever sees two tenants — an operator
  // assigning a second tenant to the bot, a key copied from another site — the hub would answer with
  // both clients' documents and this site would publish a mix of them. Assert what the key promises:
  // every document of every collection carries the same tenant, and `site` is exactly one document.

  const KEY_HINT = 'is PAYLOAD_API_KEY a build-bot key scoped to one tenant?';

  /** `tenant` is an id at `depth=1` (the plugin caps its depth), but tolerate a populated object. */
  function tenantId(doc: unknown): string | number | undefined {
    const value = (doc as { tenant?: unknown } | null)?.tenant;
    if (typeof value === 'string' || typeof value === 'number') return value;
    const id = (value as { id?: unknown } | null)?.id;
    return typeof id === 'string' || typeof id === 'number' ? id : undefined;
  }

  /** Every tenant id seen so far in this build, in the order they first appeared. */
  const tenants: (string | number)[] = [];

  function assertOneTenant(collection: string, docs: unknown[]): void {
    for (const doc of docs) {
      const id = tenantId(doc);
      if (id !== undefined && !tenants.includes(id)) tenants.push(id);
    }
    if (tenants.length > 1) {
      throw new Error(`CMS ${collection}: documents from more than one tenant (${tenants.join(', ')}) — ${KEY_HINT}`);
    }
  }

  async function loadDocs(collection: string): Promise<unknown[]> {
    const url = collectionUrl(BASE as string, collection);
    const res = await request(collection, url);
    const contentType = res.headers.get('content-type') ?? 'none';
    let text: string;
    try {
      text = await res.text();
    } catch (cause) {
      // A reset mid-body, or a body still arriving at the 20 s deadline: same shape as the header
      // phase, because to the operator it is the same failure.
      throw unreachable(collection, url, cause);
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }

    if (!res.ok) {
      const status = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
      const detail = payloadMessage(body);
      const hint =
        res.status === 401 || res.status === 403 ? ' — check PAYLOAD_API_KEY is the build-bot key for this tenant' : '';
      throw new Error(`CMS ${collection}: ${status} from ${url}${detail ? ` (${detail})` : ''}${hint}`);
    }
    const list = body as { docs?: unknown; hasNextPage?: unknown } | null;
    if (!list || typeof list !== 'object' || !Array.isArray(list.docs)) {
      throw new Error(
        `CMS ${collection}: ${url} did not return a Payload list (content-type ${contentType})` +
          ' — is PAYLOAD_URL the hub origin?',
      );
    }
    if (list.docs.length === 0) {
      const fix = collection === 'site' ? 'create the Site document for this tenant' : 'create them in the hub admin';
      throw new Error(`CMS ${collection}: no documents for this tenant — ${fix}`);
    }
    if (list.hasNextPage) {
      throw new Error(
        `CMS ${collection}: more than ${PAGE_LIMIT} documents; raise PAGE_LIMIT in @hollandtech/site-cms`,
      );
    }
    assertOneTenant(collection, list.docs);
    // `site` is a per-tenant global: two documents means the key sees more than this site's content,
    // and `mapSite` would silently pick whichever the hub sorted first.
    if (collection === 'site' && list.docs.length !== 1) {
      throw new Error(
        `CMS site: expected exactly 1 document for this tenant, got ${list.docs.length}` + ` — ${KEY_HINT}`,
      );
    }
    return list.docs;
  }

  const cache = new Map<string, Promise<unknown>>();

  /**
   * One computation per key per build; concurrent callers share the promise, and a rejection is
   * evicted so the next caller retries rather than replaying it.
   */
  function memo<T>(key: string, produce: () => Promise<T>): Promise<T> {
    let pending = cache.get(key);
    if (!pending) {
      pending = produce();
      cache.set(key, pending);
      pending.catch(() => cache.delete(key));
      if (dev) {
        // `astro dev` keeps this module alive across reloads; let the next reload see fresh content.
        pending.then(
          () => setTimeout(() => cache.delete(key), 1_000).unref?.(),
          () => {},
        );
      }
    }
    return pending as Promise<T>;
  }

  /** One request per collection per build. */
  const fetchDocs = <T>(collection: string): Promise<T[]> => memo(collection, () => loadDocs(collection)) as Promise<T[]>;

  // ---- media origin check -------------------------------------------------------------------
  //
  // `astro:assets` only optimises a remote image matched by `image.remotePatterns`, and it matches on
  // protocol, host *and* port. For anything else `getURL()` quietly returns the raw `src`, so the
  // page ships the full-size original with no build error. Catch that here, at the one place that
  // knows the field — against `mediaOrigins.ts`, the same list `astro.config.mjs` configures, so a
  // URL this accepts is exactly a URL Astro will optimise.

  function assertMediaUrl(field: string, src: string): void {
    if (!URL.canParse(src)) {
      throw new Error(`CMS ${field}: media URL "${src}" is not absolute — is the hub's serverURL set?`);
    }
    if (ORIGINS.isAllowedMediaUrl(src)) return;
    throw new Error(
      `CMS ${field}: media URL ${src} is not an allowed image origin (expected ${ORIGINS.describe()})` +
        ' — Astro would ship it unoptimised',
    );
  }

  /** Mapped content is a handful of levels deep; anything deeper is a shape nobody meant to write. */
  const MAX_DEPTH = 12;

  /** Walk mapped content for every `RemotePhoto` (`{ src, width, height }`), whatever field it sits in. */
  function checkPhotos(value: unknown, path: string, depth = 0): void {
    if (depth > MAX_DEPTH) {
      throw new Error(`CMS ${path}: content nested more than ${MAX_DEPTH} levels deep — check the mappers`);
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => checkPhotos(item, `${path}[${i}]`, depth + 1));
    } else if (value && typeof value === 'object') {
      // `'format' in value` first, before any property *read*: a local `ImageMetadata` is a Proxy in
      // a production build whose `get` trap copies the unoptimised original into `dist/`, and `in`
      // goes through `has`, which it does not trap. See `photo.ts`.
      if (!('format' in value) && 'src' in value && typeof value.src === 'string' && 'width' in value) {
        assertMediaUrl(path, value.src);
      } else {
        for (const [key, child] of Object.entries(value)) checkPhotos(child, `${path}.${key}`, depth + 1);
      }
    }
  }

  function checked<T>(collection: string, content: T): T {
    checkPhotos(content, collection);
    return content;
  }

  // ---- warnings ------------------------------------------------------------------------------

  /** One warning per missing icon per build, not per card. */
  const warnedIcons = new Set<string>();

  // ---- getters ------------------------------------------------------------------------------

  return {
    cmsEnabled,

    /** The mapped result is cached too: ten call sites, one `mapSite` and one photo walk per build. */
    async getSite() {
      if (!cmsEnabled) return local.site;
      return memo('site:content', async () => {
        const content = mapSite((await fetchDocs<HubSiteDoc>('site'))[0] as HubSiteDoc);
        assertMediaUrl('site.hero.video', content.hero.video);
        return checked('site', content);
      });
    },
    async getServices() {
      return cmsEnabled ? checked('services', mapServices(await fetchDocs<HubServiceDoc>('services'))) : local.services;
    },
    async getProjects() {
      return cmsEnabled ? checked('projects', mapProjects(await fetchDocs<HubProjectDoc>('projects'))) : local.projects;
    },
    async getTestimonials() {
      return cmsEnabled
        ? checked('testimonials', mapTestimonials(await fetchDocs<HubTestimonialDoc>('testimonials')))
        : local.testimonials;
    },
    async getProcess() {
      return cmsEnabled
        ? checked('process', mapProcess(await fetchDocs<HubProcessStepDoc>('process-steps')))
        : local.process;
    },
    async getStats() {
      return cmsEnabled ? checked('stats', mapStats(await fetchDocs<HubStatDoc>('stats'))) : local.stats;
    },
    async getFaqs() {
      return cmsEnabled ? checked('faqs', mapFaqs(await fetchDocs<HubFaqDoc>('faqs'))) : local.faqs;
    },

    warnMissingIcon(icon) {
      if (warnedIcons.has(icon)) return;
      warnedIcons.add(icon);
      warn(
        `ServiceIcon: no artwork for "${icon}" in this template — rendering the placeholder glyph.` +
          ' Draw it in src/components/ui/ServiceIcon.astro or pick a drawn icon in the CMS.',
      );
    },
  };
}
