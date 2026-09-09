// @ts-check
/**
 * The optional per-consumer config, `site-cms.config.mjs` at the repo root.
 *
 * Every value has a default that reproduces exactly what the landscaping template did before this
 * package existed, so a repo with no config file behaves identically. The file exists for the one
 * genuinely per-template thing in the CLI: which raw URLs a parity run may normalise away.
 *
 * @typedef {object} ParityConfig
 * @property {string[]} mediaUrlPrefixes  Regex fragments a raw media URL may start with.
 * @property {string[]} mediaExtensions  Regex fragments a raw media URL may end in.
 * @property {string[]} mediaAttributes  `attr="…"` attributes whose value is a raw media URL.
 * @property {[string, string][]} mediaTagAttributes  `<tag attr="…"` pairs, same.
 * @property {{ pattern: string, token: string }[]} hashedAssets  Hashed build assets, collapsed to
 *   one token *after* the media rules so a hashed original is not swallowed before it is recognised.
 *
 * @typedef {object} SiteCmsConfig
 * @property {ParityConfig} parity
 */
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export const CONFIG_FILE = 'site-cms.config.mjs'

/**
 * The rules the landscaping template used inline, as data. Only three things legitimately differ
 * between a CMS build and a standalone one:
 *
 *   1. `/_astro/<file>` names. Optimised local images are `<name>.<viteHash>_<transformHash>.webp`,
 *      remote-fetched ones `<name>_<transformHash>.webp`; CSS/JS hashes can differ too. Every
 *      `/_astro/` reference collapses to `/_astro/X`, leaving its `srcset` descriptor intact.
 *   2. The hero poster: standalone `/_astro/hero-poster.<hash>.jpg` (the referenced original) vs the
 *      hub's absolute media URL. Both become `MEDIA/hero-poster.jpg`.
 *   3. The hero video: standalone `/hero.mp4` (from `public/`) vs the hub's absolute URL. Both
 *      become `MEDIA/hero.mp4`.
 *
 * 2 and 3 are scoped to the two attributes that legitimately carry a raw URL, keep the basename, and
 * run before 1. A raw media URL anywhere else, or a different basename, still shows as a difference.
 *
 * @type {ParityConfig}
 */
export const PARITY_DEFAULTS = {
  mediaUrlPrefixes: ["https?://[^\"' )]+/", '/_astro/', '/'],
  mediaExtensions: ['mp4', 'jpe?g', 'png', 'webp', 'avif'],
  mediaAttributes: ['poster'],
  mediaTagAttributes: [['source', 'src']],
  hashedAssets: [{ pattern: "/_astro/[^\"' )]+", token: '/_astro/X' }],
}

/**
 * Load `site-cms.config.mjs` from `root` if it is there, merged one level deep over the defaults.
 *
 * @param {string} root
 * @returns {Promise<{ parity: ParityConfig }>}
 */
export async function loadConfig(root) {
  const path = resolve(root, CONFIG_FILE)
  /** @type {Partial<SiteCmsConfig>} */
  let user = {}
  if (existsSync(path)) {
    const mod = await import(pathToFileURL(path).href)
    user = mod.default ?? mod
  }
  return { parity: { ...PARITY_DEFAULTS, ...(user.parity ?? {}) } }
}
