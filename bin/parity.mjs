// @ts-check
/**
 * Parity check: the page a hub-triggered (CMS) build produces must be the page the standalone
 * template produces, once the differences that are *known* to be presentation-identical are
 * normalised away. Anything else — copy, attributes, `width`/`height`, `srcset` descriptors,
 * element order — must match byte for byte.
 *
 *   PAYLOAD_URL=http://localhost:3000 PAYLOAD_API_KEY=… npx site-cms parity
 *
 * Runs the CMS build first and the standalone build second, so `dist/` is left in the default
 * (standalone) state. On a mismatch the raw and normalised HTML of both builds are written to
 * `.parity/` for diffing; on success one summary line gives a size/asset-count baseline.
 *
 * The normalisation rules are the one per-template thing here, so they come from
 * `site-cms.config.mjs` (`parity`), defaulting to the landscaping template's original three.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfig } from './config.mjs'

/**
 * @param {string} root  The consumer repo.
 * @param {string[]} argv
 */
export async function parity(root, argv) {
  if (argv.length) throw new Error(`parity takes no arguments (got ${argv.join(' ')})`)
  const { parity: cfg } = await loadConfig(root)

  // ---- normalisation --------------------------------------------------------------------------

  /** Absolute `http(s)://…/name.ext`, a `/_astro/name.<hash>.ext` original, or a `/name.ext` public file. */
  const RAW_MEDIA_URL = new RegExp(
    `^(?:${cfg.mediaUrlPrefixes.join('|')})([A-Za-z0-9-]+?)(?:\\.[A-Za-z0-9_-]+)?\\.(${cfg.mediaExtensions.join('|')})$`,
  )

  /**
   * @param {string} url
   * @returns {string} `MEDIA/<name>.<ext>` for a known media-URL shape, otherwise the url unchanged.
   */
  const mediaToken = (url) => {
    const m = RAW_MEDIA_URL.exec(url)
    return m ? `MEDIA/${m[1]}.${m[2]}` : url
  }

  /** @param {string} html */
  const norm = (html) => {
    let out = html
    for (const attr of cfg.mediaAttributes) {
      out = out.replace(new RegExp(`\\b${attr}="([^"]+)"`, 'g'), (_, url) => `${attr}="${mediaToken(url)}"`)
    }
    for (const [tag, attr] of cfg.mediaTagAttributes) {
      out = out.replace(new RegExp(`<${tag} ${attr}="([^"]+)"`, 'g'), (_, url) => `<${tag} ${attr}="${mediaToken(url)}"`)
    }
    for (const { pattern, token } of cfg.hashedAssets) {
      out = out.replace(new RegExp(pattern, 'g'), token)
    }
    return out
  }

  // ---- builds ---------------------------------------------------------------------------------

  /**
   * @param {string} label
   * @param {NodeJS.ProcessEnv} env  Overrides merged over the current environment.
   * @returns {string} The built `dist/index.html`.
   */
  const build = (label, env) => {
    console.log(`\n[parity] ${label} build\n`)
    execSync('npm run build', { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
    return readFileSync(resolve(root, 'dist/index.html'), 'utf8')
  }

  const hubUrl = process.env.PAYLOAD_URL
  if (!hubUrl || !process.env.PAYLOAD_API_KEY) {
    throw new Error('export PAYLOAD_URL and PAYLOAD_API_KEY for the demo tenant')
  }

  const cmsRaw = build('CMS', {})
  // Empty strings are falsy for both `createCms` guards and for the `loadEnv` merge in astro.config.
  const standaloneRaw = build('standalone', { PAYLOAD_URL: '', PAYLOAD_API_KEY: '' })

  // Guards that each build really ran in the mode it claims, so a pass cannot be vacuous.
  const hubOrigin = new URL(hubUrl).origin
  if (standaloneRaw.includes(hubOrigin)) {
    throw new Error(`standalone build references the hub origin ${hubOrigin}; PAYLOAD_URL leaked in`)
  }
  if (cmsRaw === standaloneRaw) {
    throw new Error('CMS build is byte-identical to the standalone build; did PAYLOAD_URL apply?')
  }

  // ---- compare --------------------------------------------------------------------------------

  const standalone = norm(standaloneRaw)
  const cms = norm(cmsRaw)

  if (standalone !== cms) {
    const out = resolve(root, '.parity')
    rmSync(out, { recursive: true, force: true })
    mkdirSync(out)
    writeFileSync(resolve(out, 'standalone.html'), standalone)
    writeFileSync(resolve(out, 'cms.html'), cms)
    writeFileSync(resolve(out, 'standalone.raw.html'), standaloneRaw)
    writeFileSync(resolve(out, 'cms.raw.html'), cmsRaw)
    console.error('PARITY FAILED: diff .parity/standalone.html .parity/cms.html')
    process.exit(1)
  }

  const token = cfg.hashedAssets[0]?.token ?? ''
  /** @param {string} html */
  const assetRefs = (html) => (token ? html.split(token).length - 1 : 0)
  console.log(
    `PARITY OK — normalised standalone ${standalone.length} B (${assetRefs(standalone)} ${token} refs), ` +
      `cms ${cms.length} B (${assetRefs(cms)} ${token} refs); raw sizes ${standaloneRaw.length} / ${cmsRaw.length} B`,
  )
}
