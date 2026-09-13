/**
 * The shape of `site-cms.config.mjs`, the optional per-consumer config the CLI reads from the repo
 * root.
 *
 * The file is part of this package's public surface, so its type is published here rather than left
 * to each consumer to re-declare. Before this existed, `template-landscaping/site-cms.config.mjs`
 * carried a hand-written copy of these typedefs with a comment saying why — a copy nothing checked,
 * which would have gone quietly wrong the first time the shape changed.
 *
 * Annotate the config file against it:
 *
 * ```js
 * // site-cms.config.mjs
 * /** @type {import('@hollandtech/site-cms/config').SiteCmsConfig} *\/
 * export default {
 *   parity: { mediaAttributes: ['poster', 'data-hero-video'] },
 * };
 * ```
 *
 * Types only — the runtime defaults stay in `bin/config.mjs`, which is where the CLI reads them and
 * the only place they are needed.
 */

/**
 * How a `parity` run normalises away the differences that are *known* to be presentation-identical
 * between a CMS build and a standalone one. Every field is a list of regex fragments or literals;
 * see `PARITY_DEFAULTS` in `bin/config.mjs` for the landscaping template's original rules, which
 * are also the defaults.
 */
export interface ParityConfig {
  /** Regex fragments a raw media URL may start with. */
  mediaUrlPrefixes: string[];
  /** Regex fragments a raw media URL may end in. */
  mediaExtensions: string[];
  /** `attr="…"` attributes whose value is a raw media URL. */
  mediaAttributes: string[];
  /** `<tag attr="…"` pairs, same. */
  mediaTagAttributes: [string, string][];
  /**
   * Hashed build assets, collapsed to one token *after* the media rules, so a hashed original is
   * not swallowed before it is recognised.
   */
  hashedAssets: { pattern: string; token: string }[];
}

/**
 * What a consumer's `site-cms.config.mjs` exports by default. Every key is optional and merged one
 * level deep over the defaults, so a repo overrides the one rule it needs and inherits the rest —
 * and a repo with no config file at all behaves identically to one with `{}`.
 */
export interface SiteCmsConfig {
  parity?: Partial<ParityConfig>;
}

/** `site-cms.config.mjs` after the merge: every field present. What the CLI actually runs on. */
export interface ResolvedSiteCmsConfig {
  parity: ParityConfig;
}
