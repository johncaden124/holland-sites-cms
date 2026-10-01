# Changelog

Every version of `@hollandtech/site-cms`. Consumers install a tag from git
(`github:johncaden124/holland-sites-cms#vX.Y.Z`). The versioning rule is in the README under
"Release flow": before 1.0, any change to the public types or the content schema is a **minor**
bump.

Entries before 0.6.0 were backfilled from the git tags and their annotations.

## 0.7.0 — 2026-10-01

### Added
- `Social['label']` gains `yelp`, `nextdoor`, `youtube` and `tiktok`, and the mapper accepts them.
  There is no `google` label: the Google Business Profile link is `business.gbp.url`.
  - Templates map the label to a glyph and an accessible name. A template whose map has no entry
    for a new label renders an empty icon, so add artwork for all four when bumping.
  - The hub's `socials.label` select needs the same four values.
- `new-site` now initialises the output as a git repository: `git init -b main` plus one commit,
  `Create <dir> from <repo>@<ref>`. This records which template commit the site came from. It adds
  no remote. `--no-git` restores the old plain directory.

### Changed
- `check-version-bump` ignores documentation. It compares `etc/` and `schema/` with comment lines
  and `description`s stripped, so a doc-only change needs no version bump. Regenerating and
  committing those files is still enforced by `api:check` / `check:schema`.
- `consumers.json` pins template-landscaping to its commit with footer icons for the four new networks (template-landscaping#6), on top of its bump to v0.6.0.

## 0.6.0 — 2026-09-30

The contract review: the content model now covers the whole business, content can be validated
outside TypeScript, breaking changes can't ship by accident, and the CLI can fill a template.

### Added: content model (all optional, so v0.5 content is still valid)
- `SiteSettings.business?: BusinessProfile`. This holds the business's structured facts:
  - `trade` (the hub's `NICHES`, exported as `TRADES` / `Trade`), `town`, `serviceAreaTowns`
  - `address` (schema.org `PostalAddress` fields) and `geo` (`lat`/`lng`)
  - `openingHours` (`OpeningHoursSpecification`-compatible)
  - `phone` (`e164`, the Holland tracking number, plus an optional `display`)
  - `email`, `siteUrl`, `gbp` (`url`, `placeId`) and `reviews` (`count`, `rating`)
- `SiteSettings.copy?: CopyInputs`. These are the generator's five copy inputs: `businessName` (an alias of `site.name`), `town`, `primaryService`, `differentiator` (`same-day | 24-7 | family-owned | licensed-insured | free-estimates | none`) and `tenure` (`number | null`).
- `SiteSettings.flags?`: `reviewsFromGbp`, `isPreview`.
- `Service.priceHint?`.
- On `Testimonial`: `rating?` (1–5), `date?` (ISO date) and `source?` (`google | facebook | yelp | nextdoor | direct`).
- The mappers carry all of the above from the hub when a tenant sets them. An unset group maps to nothing, so v0.5 tenants map exactly as before.
- A flag maps only when it is on. The hub stores flags as checkboxes, which are `false` by default, so `false` maps to no key.
- In a content file, `business.serviceAreaTowns` travels as `{ text }` rows, like `bullets`, matching the hub's array field.
- `HeroMedia` is now exported from the root as well as `./types`.

### Added: validation and schema
- `schema/site-content.schema.json` (on the `./schema` subpath) is JSON Schema for `LocalContent`, generated from `types.ts`.
- `validateSiteContent(value, { root?, path? })` and `formatProblems()` are on the root and on `./validate`. They report every problem at once, each with its field path. The validator is compiled from the schema at build time, so the package still has no runtime dependencies.
- `createCms()` now validates:
  - the template's `local` content once, at import;
  - every hub getter's mapped result, listing every mismatch in one error that names the hub URL and the fix. Previously it failed on the first missing field.
- Media-origin errors now also name the hub URL the media came from, and the fix.

### Added: CLI
- `site-cms import-content <content.json>` writes `src/data/*.ts` from a content file, in one canonical format. It round-trips byte for byte with `export-content`.
- `site-cms new-site --from --template --out` clones a template at its pinned ref (from `consumers.json`), imports the content and media, sets `CMS_REQUIRED`, and points `.env.example` at the hub.
- `export-content --client <slug>` writes the hub's whole `clients/<slug>/` folder: `tenant.json`, `content.json` and `media/`.
- `export-content --validate` checks the result against the content model and the hub's tenant rules.
- Every command now has its own `--help`. On failure a command exits 1 and prints only the error, to stderr:
  - `parity` captures build logs and puts their tail into the error instead of streaming them;
  - `capture-fixtures` writes nothing unless all seven collections succeed.
- The `./content-file` subpath exposes `toContentFile`, `fromContentFile`, `renderDataModules`, `contentFileProblems` and `CONTENT_MODULES`. The `./trades` subpath exposes `TRADES`.

### Added: breaking-change protection
- API Extractor reports for every entry point, committed in `etc/`. `npm run api:check` fails CI on any unreported API change.
- `npm run check:version-bump` fails a PR that changes `etc/` or `schema/` without the bump the rule requires.
- A consumer smoke workflow installs this package into each template in `consumers.json` at its pinned ref and runs that template's `npm test` and `npm run parity`. Parity runs against `scripts/mock-hub.mjs`.
- `npm run check:service-icons` proves `./service-icons` loads one module in plain Node and touches no DOM global.

### Changed
- `DEFAULT_MEDIA_HOST` is now `media.hollandsites.com` (it was `media.hollandtech.com`), matching the hub's `MEDIA_PUBLIC_URL`. This only affects a consumer that leaves `PUBLIC_MEDIA_HOST` unset.
- Examples and messages name `hub.hollandsites.com`.
- `oneOf` in the mappers accepts number unions as well as string unions.

## 0.5.1 — 2026-09-13
- Documented what `parity` needs from the environment: every variable the consumer's build requires, with one value for both builds.

## 0.5.0 — 2026-09-13
- New `./config` subpath: the `SiteCmsConfig` / `ParityConfig` types for `site-cms.config.mjs`.
- `pruneStandaloneMedia` now also reads stylesheets and JS chunks before deleting a file. It has more tests.

## 0.4.1 — 2026-09-12
- `pruneStandaloneMedia`: a reference must be a URL starting at the path, not a substring match.

## 0.4.0 — 2026-09-12
- New `./astro` subpath with the `pruneStandaloneMedia` integration. It drops standalone-only `public/` files (the hero video) from CMS builds.

## 0.3.1 — 2026-09-12
- The `astro` peer dependency is optional, so the hub can install the package without Astro.

## 0.3.0 — 2026-09-12
- The build fails, naming the path, when the hub stops sending a field.
- New `./service-icons` subpath: the icon vocabulary, dependency-free, for the hub.

## 0.2.1 — 2026-09-11
- `parity` drops a media URL's query string (per-tenant media prefixes on a dev hub).

## 0.2.0 — 2026-09-10
- New optional `SiteSettings` fields: `heroEyebrow`, `licenseNumber`, `footer.serviceArea`, `footer.hours`, and matching labels.
- `recommend` renamed to `heroBadge`.
- `hero.video` is optional.
- `export-content` reads the hero media from `src/data/hero.ts`.

## 0.1.0 — 2026-09-09
- Extracted the shared CMS layer from the landscaping template: types, `createCms`, the mappers, media origins, the icon vocabulary, and the `parity` / `export-content` / `capture-fixtures` CLI.
- The package builds on install, so it works as a git dependency.
