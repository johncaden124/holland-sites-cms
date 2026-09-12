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
npm i github:johncaden124/holland-sites-cms#v0.1.0
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

### `./service-icons` — for the hub, not the templates

```ts
import { SERVICE_ICONS, type ServiceIcon } from '@hollandtech/site-cms/service-icons';
```

The service-icon vocabulary is the contract between the CMS (which offers the values) and every
template (which draws them), so the hub needs it too — and the hub is a Next/Payload app with no
Astro. This subpath is the vocabulary alone: no Astro types, no `Photo`, nothing that would drag the
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

## Development

```bash
npm install
npm run build       # tsc → dist/*.js + dist/*.d.ts
npm test            # vitest (73 tests, no Astro pipeline needed)
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
