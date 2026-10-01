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
| `mediaOrigins`, `imageProps`, `SERVICE_ICONS`, `TRADES` | `ServiceIcon.astro` artwork; `astro.config.mjs` |
| the JSON Schema and `validateSiteContent` | — |
| `site-cms parity / export-content / import-content / new-site / capture-fixtures` | its own fixtures and its fixture-vs-`src/data` test |

The hub is **`https://hub.hollandsites.com`** and it serves media from
**`https://media.hollandsites.com`**, which is `DEFAULT_MEDIA_HOST` and what `PUBLIC_MEDIA_HOST` should
be in every client build.

## Installing it

Until the `@hollandtech` npm scope exists, templates depend on this repo from git:

```bash
npm i github:johncaden124/holland-sites-cms#v0.6.0      # a template (npm)
pnpm add github:johncaden124/holland-sites-cms#v0.6.0   # the hub (pnpm)
```

npm clones the repo, installs its devDependencies and runs `prepare`, which is `npm run build` —
so `dist/` stays out of git and every consumer compiles it on install. Moving to npm later is a
one-line change to the dependency spec in each template; nothing else moves.

### Bumping a consumer to a new version

1. Read the version's entry in `CHANGELOG.md`. Before 1.0 a minor bump can change types, so check
   what it says.
2. Change the tag in the consumer's `package.json`
   (`"@hollandtech/site-cms": "github:johncaden124/holland-sites-cms#v0.6.0"`), then `npm install`
   (a template) or `pnpm install` (the hub).
3. In a template, run `npm run check`, `npm test`, and `npm run parity` against the demo tenant (see
   [The CLI](#the-cli) for its environment). In the hub, run `pnpm typecheck` and `pnpm test`.
4. Commit the lockfile with the bump.

## Exports

| Import | What it is | Needs Astro? |
| --- | --- | --- |
| `@hollandtech/site-cms` | everything below except `./astro` and `./content-file`: `createCms`, `COLLECTIONS`, `collectionUrl`, the mappers and `Hub*Doc` types, `media`/`photo`, `imageProps`/`isLocal`/`isRemote`, `mediaOrigins`/`parsePayloadUrl`/`parseMediaHost`/`DEFAULT_MEDIA_HOST`, `SERVICE_ICONS`, `TRADES`, `validateSiteContent`/`formatProblems`, and every content type | types only (`Photo`) |
| `./types` | the content model: `SiteSettings`, `SiteContent`, `LocalContent`, `Service`, `GalleryImage`, `Testimonial`, `ProcessStep`, `Stat`, `Faq`, `HeroMedia`, `BusinessProfile`, `CopyInputs`, `SiteFlags`, `OpeningHours`, `PostalAddress`, `Geo`, `Trade`, `Differentiator`, `TestimonialSource`, … plus `SERVICE_ICONS` and `TRADES` | types only |
| `./validate` | `validateSiteContent(value, { root?, path? })`, `formatProblems` | no |
| `./schema` | `schema/site-content.schema.json` — JSON Schema (draft-07) for `LocalContent`, every type a named definition | no |
| `./content-file` | the content file (`content.json`) projections: `toContentFile`, `fromContentFile`, `toLocalContent`, `renderDataModules`, `contentFileProblems`, `contentFileMedia`, `CONTENT_MODULES` | no |
| `./media-origins` | `mediaOrigins`, `parsePayloadUrl`, `parseMediaHost`, `DEFAULT_MEDIA_HOST` — for `astro.config.mjs` | no |
| `./photo` | `imageProps`, `isLocal`, `isRemote`, `Photo`, `RemotePhoto` | types only |
| `./service-icons` | `SERVICE_ICONS`, `ServiceIcon` — for the hub | **no**, checked in CI |
| `./trades` | `TRADES`, `Trade` — the hub's `NICHES`, value for value | no |
| `./astro` | `pruneStandaloneMedia` | yes |
| `./config` | `SiteCmsConfig`, `ParityConfig` — the shape of `site-cms.config.mjs` | no |
| `bin: site-cms` | the CLI, below | — |

## The content contract

`types.ts` is the contract. `LocalContent` (the site plus six lists) is a whole site, and
`schema/site-content.schema.json` is the same contract as JSON Schema, generated from the types by
`npm run schema`. The schema is committed, and CI fails if it is stale. Non-TypeScript tools (the
generator, the hub's seed) validate against the schema file, and TypeScript tools call
`validateSiteContent`:

```ts
import { validateSiteContent, formatProblems } from '@hollandtech/site-cms/validate';

const { ok, problems } = validateSiteContent(content);   // never throws on bad content
if (!ok) throw new Error(formatProblems(problems));        //   - site.site.business.phone.e164: must match ^\+[1-9]\d{7,14}$ (got "614-555-0123")
```

It reports every problem at once, each with a path. `copy.businessName` must equal `site.name`.
`createCms` runs it on the template's own `local` content at import, and on every hub collection
before a getter returns.

v0.6 added the facts a generated site needs. They are all optional, so v0.5 content is still valid:

- **`site.business`** holds the structured facts: `trade`, `town`, `serviceAreaTowns`, `address`,
  `geo`, `openingHours` (`OpeningHoursSpecification`-shaped), `phone.e164` (the Holland tracking
  number) with an optional `display`, `email`, `siteUrl`, `gbp` and `reviews`. The footer strings
  stay what a template *prints*. These fields are the machine-readable form, for structured data,
  maps and call tracking.
- **`site.copy`** holds the generator's five inputs: `businessName`, `town`, `primaryService`,
  `differentiator` and `tenure`. The hero, about, CTA and meta copy are derived from these when a
  site is generated, and are not stored here.
- **`site.flags`** holds `reviewsFromGbp` and `isPreview`.
- **`Service.priceHint`**, and **`Testimonial.rating` / `date` / `source`**.

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
npx site-cms parity                                         # CMS build vs standalone build, diffed
npx site-cms export-content --client acme-lawn --validate   # src/data → clients/acme-lawn/{tenant.json,content.json,media/}
npx site-cms import-content clients/acme-lawn/content.json --media clients/acme-lawn/media
npx site-cms new-site --from clients/acme-lawn/content.json --template template-landscaping --out ../acme-lawn
npx site-cms capture-fixtures --out src/lib/__fixtures__
```

Every command keeps the same contract, because the generator shells out to them:
- `site-cms <command> --help` prints that command's options and environment, and exits 0.
- A failure exits 1 and prints **only the error**, to stderr, with nothing on stdout.
- Success prints a short summary to stdout.

| Command | Environment it reads |
| --- | --- |
| `parity` | `PAYLOAD_URL` (the hub origin; `http://localhost:3000` for a local hub), `PAYLOAD_API_KEY` (the demo tenant's build-bot key: `pnpm bot-key demo-landscaping` in the hub), plus everything the template's own CMS build needs (`PUBLIC_SITE_URL`), with one value for both builds |
| `capture-fixtures` | `PAYLOAD_URL`, `PAYLOAD_API_KEY` |
| `new-site` | `SITE_CMS_GIT_TOKEN`, optional: a GitHub token with read access to the (private) template. Without it, git's own credentials are used |
| `export-content`, `import-content` | none |

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
  hub schema (`toContentFile`) and verifies the result is lossless before writing.
  - `--client <slug>` writes the exact folder the hub's `seed:tenant` reads:
    `clients/<slug>/tenant.json`, `content.json` and `media/`. The tenant fields come from the
    content (`site.name`, `business.trade`, `business.siteUrl`) and the repo's package name. An
    existing `tenant.json` keeps its other fields, such as `deployHookUrl`, and flags override
    everything.
  - `--out` / `--media` write only those pieces, as in v0.5.
  - `--validate` also holds the result to the content model and the hub's `tenant.json` rules.
- **`import-content <file>`** is the reverse. It writes the ten `src/data/*.ts` modules from a
  content file, in one canonical format owned by the generator: a header, `import type`, one
  import per image, and annotated multi-line literals. Images are copied to `src/assets/` and the
  hero video to `public/`.
  - The file is checked (the hub's rules, then the content model) before anything is written.
  - Export → import → export gives the same content file byte for byte, and import → export →
    import gives byte-identical `src/data` (`test/roundtrip.test.ts`).
  - A hand-written template's modules are not reproduced byte for byte: comments and import
    names are its own. The *content* is reproduced exactly.
- **`new-site --from <content.json> --template <name> --out <dir>`** is the one command the
  generator calls. It clones the template at the commit pinned in this package's `consumers.json`
  (or `--ref`) without its history, imports the content and media (from `--media` or the `media/`
  folder next to the file), and sets `CMS_REQUIRED` to `true` (`--no-cms-required` for a demo).
  It also sets `PAYLOAD_URL`, `PUBLIC_MEDIA_HOST` and `PUBLIC_SITE_URL` (from `business.siteUrl`)
  in `.env.example`, keeping every other variable. On failure it removes what it created.
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
npm test            # builds, then vitest (147 tests; the CLI tests run bin/ against dist/)
npm run typecheck   # holds test/, bin/ and scripts/ to the same types as src/
npm run schema      # regenerate schema/ and src/generated/ after changing types.ts
npm run api:report  # regenerate etc/*.api.md after changing an export
npm run check:service-icons
```

`node scripts/mock-hub.mjs <template-dir>` serves a template's captured fixtures as a hub on
`:3000`, which is enough for `site-cms parity` without a Payload hub.

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

1. Land the change. `npm test`, `npm run typecheck`, `npm run check:schema`, `npm run api:check`
   and `npm run check:service-icons` must be green (CI runs them all).
2. Bump `version` by the rule below and add a `CHANGELOG.md` entry.
3. `npm publish` — `prepublishOnly` rebuilds and reruns the tests, and `files` ships only
   `dist/`, `bin/` and this README.
4. Bump the dependency in each template repo and run that template's own parity check.

### The versioning rule (enforced)

The contract is `etc/*.api.md` (every exported name and type, generated by API Extractor) plus
`schema/site-content.schema.json`. CI fails when either is stale. On a pull request,
`npm run check:version-bump` compares both with the base branch:

- **Before 1.0 (`0.y.z`)**: any change to either needs at least a **minor** bump. A patch bump is
  refused, because consumers pin `#v0.y.z` tags and the `0.y` line is the only compatibility
  promise there is. So an added optional field is a minor, and so is a renamed one.
- **From 1.0**: a change that only adds lines is a minor; one that removes or alters a line is a
  major.

**Documentation is not contract.** Doc comments end up in `etc/` and as `description`s in the
schema, so rewording one changes those files. They must still be regenerated and committed, and
`api:check` / `check:schema` still fail until they are. But the bump check compares the files with
comment lines and descriptions stripped (`scripts/contract.mjs`), so a doc-only change needs no
version bump.

A patch is for changes that leave the stripped contract untouched: fixes, docs, CLI behaviour.

### Consumer smoke test

`.github/workflows/consumer-smoke.yml` runs on every push to main and every PR:

1. `npm pack` this commit.
2. Check out each template in `consumers.json` at its **pinned commit**, run `npm ci`, and
   install the tarball over its pinned version.
3. Run the template's own `npm test`, then `npm run parity` against `scripts/mock-hub.mjs`
   serving that template's captured fixtures. No hub or hub secret is needed.

Setup: the templates are private, so the workflow needs a repository secret **`CONSUMERS_TOKEN`**:
a fine-grained GitHub token with read-only *Contents* access to each template repo. To test
against a newer template, bump its `ref` in `consumers.json` in its own commit. `new-site` clones
the same ref.

`peerDependencies.astro` is types-only (`import type { ImageMetadata } from 'astro'`), but every
consumer is an Astro site and it is what keeps `imageProps()`'s return assignable to `<Image src>`.

## License

MIT
