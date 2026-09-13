# @hollandtech/site-cms

The CMS layer every Holland Tech website template shares: the Payload-hub fetch layer, the mappers,
the media-origin rules, the content types and the CLI.

One Payload hub serves many niche templates — landscaping today, HVAC, plumbing and pest control
next. Each template is a separate GitHub template repo that clients fork. Without this package the
same ~1,000 lines of plumbing would be copy-pasted into every niche, and one bug fix would be N
manual ports.

**All templates share one content model and one section list, so the mappers are shared too.** A
template's freedom is *which fields it renders and how* — which lives in its `.astro` files, not
here.

| Lives here | Lives in each template |
| --- | --- |
| content types (`SiteSettings`, `Service`, `Faq`, … `SiteContent`) | `src/data/*.ts` **values** typed by them |
| `createCms` — fetch, retry, cache, tenant + media assertions | `src/lib/cms.ts` (three lines of wiring) and `cms.config.ts` |
| the mappers, hub doc shapes, `media()` / `photo()` | components, layouts, design tokens, assets |
| `mediaOrigins`, `imageProps`, `SERVICE_ICONS` | `ServiceIcon.astro` artwork; `astro.config.mjs` |
| `site-cms parity / export-content / capture-fixtures` | its own fixtures and its fixture-vs-`src/data` test |

## Installing it

Until the `@hollandtech` npm scope exists, templates depend on this repo from git:

```bash
npm i github:johncaden124/holland-sites-cms#v0.5.1
```

npm clones the repo, installs its devDependencies and runs `prepare`, which is `npm run build` —
so `dist/` stays out of git and every consumer compiles it on install. Moving to npm later is a
one-line change to the dependency spec in each template; nothing else moves.

## Using it from a template

```ts
// src/lib/cms.ts — the ONLY file in a template that reads import.meta.env
import { createCms } from '@hollandtech/site-cms';
import { CMS_REQUIRED } from './cms.config';
import * as local from './cms.local';

export const {
  cmsEnabled, getSite, getServices, getProjects, getTestimonials,
  getProcess, getStats, getFaqs, warnMissingIcon,
} = createCms({
  payloadUrl: import.meta.env.PAYLOAD_URL,
  apiKey: import.meta.env.PAYLOAD_API_KEY,
  mediaHost: import.meta.env.PUBLIC_MEDIA_HOST,
  cmsRequired: CMS_REQUIRED,   // false in a template repo, true in every client repo
  dev: import.meta.env.DEV,
  local,                        // this template's src/data, in the mappers' shapes
});
```

```js
// astro.config.mjs
import { mediaOrigins } from '@hollandtech/site-cms/media-origins';
const { remotePatterns } = mediaOrigins({ payloadUrl: env.PAYLOAD_URL, mediaHost: env.PUBLIC_MEDIA_HOST });
```

### `./astro` — the build integrations

```js
// astro.config.mjs
import { pruneStandaloneMedia } from '@hollandtech/site-cms/astro';

integrations: [pruneStandaloneMedia({ enabled: cmsEnabled, files: ['/hero.mp4'] })]
```

Astro copies `public/` verbatim into every build. That is right for a standalone template, where
`public/hero.mp4` *is* the hero video — and wrong for a hub-driven client build, where the video is a
tenant upload served from R2 and the committed file is never referenced by a single byte of the
output. The landscaping template's is 9.3 MB, shipped on every deploy of every client site built
from it.

`enabled` is the caller's decision, because only the caller can see the environment
(`!!(PAYLOAD_URL && PAYLOAD_API_KEY)`). `files` are `public/`-relative paths as they appear in the
output; the leading slash is optional. **Nothing is deleted on the strength of the flag alone** —
every built page, stylesheet and script chunk is read first, and a file still addressed by one of
them is kept and logged, so a template that starts using one of these paths for something else
cannot silently lose it. A reference has to *start* at the path: the hub serving the same basename
from its own route (`…/api/media/file/hero.mp4?prefix=1`) is not a reference to the local copy.

This is the one entry point that genuinely needs the (optional) `astro` peer — which every template
has as a direct dependency anyway.

### `./service-icons` — for the hub, not the templates

```ts
import { SERVICE_ICONS, type ServiceIcon } from '@hollandtech/site-cms/service-icons';
```

The service-icon vocabulary is the contract between the CMS (which offers the values) and every
template (which draws them), so the hub needs it too — and the hub is a Next/Payload app with no
Astro. The `astro` peer is declared **optional** for exactly this reason: it exists so `Photo` stays
assignable to `<Image src>`, which only matters to a consumer that uses `Photo`. Left required,
pnpm's auto-install-peers pulled Astro and its platform binaries into the hub for a 36-element
array. This subpath is the vocabulary alone: no Astro types, no `Photo`, nothing that would drag the
peer dependency in. It exists so the hub can import the list rather than keep a hand-synced copy of
it, which is a contract that drifts silently — the hub would offer an editor a value no template can
draw. Templates should keep importing from the root, which re-exports the same list.

`createCms` **validates eagerly and throws synchronously**, so a template calling it at module scope
fails at import — the same moment a misconfigured Cloudflare Pages build used to fail, with the same
words. The getters are closures, so destructuring them is the intended use.

### The package never reads `import.meta.env`

It cannot. The manifest declares `"astro": { "external": true }`, so Vite leaves the package alone
and never performs the `import.meta.env` substitution; the `bin/` scripts run in plain Node, where it
does not exist at all. Every value is injected — that constraint is what makes the tests plain
vitest instead of `getViteConfig` + `vi.stubEnv` + `vi.resetModules`.

## The CLI

```bash
npx site-cms parity            # CMS build vs standalone build, normalised and diffed
npx site-cms export-content --out content-export/client.json --media content-export/media
npx site-cms capture-fixtures --out src/lib/__fixtures__
```

- **`parity`** builds twice (with and without the hub) and requires the two pages to be identical
  once known-equivalent differences are normalised away. Those normalisation rules are the one
  per-template thing, so they come from an optional `site-cms.config.mjs` at the consumer root; the
  defaults reproduce the landscaping template's original rules exactly. A media URL's query string
  is dropped: the hub keys R2 objects per tenant and a dev hub addresses that as `?prefix=<id>`,
  which is addressing rather than content — the standalone build has no tenant. A differing
  *basename* is still a difference.

  Both builds inherit the environment, and only `PAYLOAD_URL` / `PAYLOAD_API_KEY` are overridden
  (emptied for the standalone half). So **anything else the consumer's own build needs has to be
  exported, and has to be one value for both halves**. A template may fail the CMS build outright
  without it — the landscaping template throws when `PUBLIC_SITE_URL` is unset in CMS mode, rather
  than ship canonical and OG tags pointing at the template's placeholder domain:

  ```bash
  PUBLIC_SITE_URL=https://leapfly.example.com \
  PAYLOAD_URL=http://localhost:3000 PAYLOAD_API_KEY=… npm run parity
  ```

  Giving such a variable two different values is worse than forgetting it: both builds succeed and
  the run fails on a difference that is the environment, not the content.
- **`export-content`** loads `src/data/*.ts` through the consumer's own Vite, projects it onto the
  hub schema and verifies the result is lossless before writing. `--media` copies every referenced
  file out of `src/assets/` and `public/` into one folder — the JSON and the uploads are the two
  halves of seeding a new tenant.
- **`capture-fixtures`** GETs each of the seven collections at exactly the URL the fetch layer
  builds, and writes the responses verbatim. **Nothing is stripped**: `tenant`, media `url`s and
  array-row `id`s all look like noise and are all read by assertions.

```js
// site-cms.config.mjs — optional; these ARE the defaults
export default {
  parity: {
    mediaUrlPrefixes: ["https?://[^\"' )]+/", '/_astro/', '/'],
    mediaExtensions: ['mp4', 'jpe?g', 'png', 'webp', 'avif'],
    mediaAttributes: ['poster'],
    mediaTagAttributes: [['source', 'src']],
    hashedAssets: [{ pattern: "/_astro/[^\"' )]+", token: '/_astro/X' }],
  },
}
```

Annotate it against the published shape rather than re-declaring one — `loadConfig` merges one level
deep, so every key is optional and an unlisted rule keeps its default:

```js
/** @type {import('@hollandtech/site-cms/config').SiteCmsConfig} */
export default { parity: { mediaAttributes: ['poster', 'data-hero-video'] } };
```

## Development

```bash
npm install
npm run build       # tsc → dist/*.js + dist/*.d.ts
npm test            # vitest (88 tests, no Astro pipeline needed)
npm run typecheck   # holds test/ to the same types as src/
```

Fixtures in `test/__fixtures__/` are verbatim hub responses; refresh them against a running hub with
`PAYLOAD_URL=… PAYLOAD_API_KEY=… node bin/site-cms.mjs capture-fixtures --out test/__fixtures__`.
They assert shape and mapping rules, never any template's copy.

## Release flow

The package ships **compiled ESM plus `.d.ts`, built by `tsc` alone** — never raw TypeScript.
Astro decides whether to transpile a dependency's TS with a heuristic in
`node_modules/astro/dist/core/create-vite.js`, which a `peerDependencies.astro` entry or an `astro`
keyword would trip; relying on it is fragile, it pushes a consumer's `astro.config.mjs` off its fast
Node `import()` path, and it cannot help the `bin/` scripts at all. `"astro": { "external": true }`
is checked *first* in that heuristic and short-circuits it, so Node imports `dist/*.js` directly.

1. Land the change; `npm run build && npm test && npm run typecheck` must be green (CI runs them).
2. Bump `version` (semver: a change to the content types or a mapper is a breaking change for every
   template on the old major).
3. `npm publish` — `prepublishOnly` rebuilds and reruns the tests, and `files` ships only
   `dist/`, `bin/` and this README.
4. Bump the dependency in each template repo and run that template's own parity check.

`peerDependencies.astro` is types-only (`import type { ImageMetadata } from 'astro'`), but every
consumer is an Astro site and it is what keeps `imageProps()`'s return assignable to `<Image src>`.

## License

MIT
