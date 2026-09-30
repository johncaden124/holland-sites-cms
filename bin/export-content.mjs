// @ts-check
/**
 * Export a template's `src/data/*.ts` modules as one content file shaped exactly like the hub's
 * Payload collections (`site` + six list collections), for seeding a tenant.
 *
 *   npx site-cms export-content --client <slug> [--dir clients] [tenant flags] [--validate]
 *   npx site-cms export-content [--out content-export/content.json] [--media content-export/media] [--validate]
 *
 * `--client` writes the folder the hub's `seed:tenant` reads, complete: `<dir>/<slug>/tenant.json`,
 * `content.json` and `media/`. The second form writes only the pieces asked for (the v0.5 flags).
 *
 * Images are reduced to their basenames (`work-1.jpg`) and the media folder holds a copy of each
 * referenced file from `src/assets/` or `public/`. The projection itself is `toContentFile` in
 * `src/contentFile.ts`; this script loads the modules and verifies the result before writing
 * anything. `--validate` additionally holds the result to the content model (`validateSiteContent`).
 *
 * The data modules must stay plain TS with relative image imports (no `astro:*` imports, no path
 * aliases) for this exporter to load them. JSON key order follows the TS source order, so
 * reordering fields in `src/data` produces a diff without a content change.
 */
import { basename, dirname, resolve } from 'node:path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { CONTENT_MODULES, contentFileProblems, fromContentFile, toContentFile, toLocalContent } from '../dist/contentFile.js'
import { formatProblems, validateSiteContent } from '../dist/validate.js'
import { TRADES } from '../dist/trades.js'
import { parseArgs, relative } from './args.mjs'

export const HELP = `site-cms export-content — src/data/*.ts → a hub content file (+ its media)

Usage:
  site-cms export-content --client <slug> [--dir clients] [--name n] [--domain d] [--niche n]
                          [--plan p] [--template t] [--repo owner/name] [--validate]
  site-cms export-content [--out file.json] [--media dir] [--validate]

--client writes <dir>/<slug>/tenant.json, content.json and media/, the folder the hub's
seed:tenant reads. Tenant fields default to: name ← site.name, niche ← business.trade,
domain ← business.siteUrl, template ← this repo's package.json name; an existing tenant.json
keeps its other fields (deployHookUrl) and flags override it.

--out defaults to content-export/content.json; --media copies the referenced files.
--validate  also check the result against the content model and the hub's tenant rules.
Run from a template repo with astro installed (the data modules load through its Vite).`

const IMAGE_RE = /\.(jpe?g|png|webp|avif|mp4)$/
/** Where a referenced media file may live in a template, in the order the exporter looks. */
const MEDIA_DIRS = ['src/assets', 'public']
/** The hub's `PLANS` (`src/collections/Tenants.ts` there). */
const PLANS = ['online', 'booked', 'growing']

/**
 * Vite, resolved from the *consumer's* `package.json` rather than from this package's own directory.
 *
 * This script has no `vite` dependency of its own and must not grow one: it has to drive the same
 * Vite the consumer's Astro uses. `createRequire` on the consumer's manifest resolves exactly what the
 * consumer's own `import('vite')` would, under npm, pnpm or a nested install alike.
 *
 * @param {string} root
 */
async function loadVite(root) {
  const require = createRequire(resolve(root, 'package.json'))
  let entry
  try {
    entry = require.resolve('vite')
  } catch {
    throw new Error(
      `cannot resolve "vite" from ${root} — it comes with astro, so run this from a repo that has astro installed (npm install first)`,
    )
  }
  return import(pathToFileURL(entry).href)
}

/**
 * Load `src/data/*.ts` through the consumer's Vite, short-circuiting image imports to basenames.
 *
 * @param {string} root
 * @returns {Promise<import('../dist/contentFile.js').DataModules>}
 */
export async function loadDataModules(root) {
  const { createServer } = await loadVite(root)
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true },
    plugins: [
      {
        name: 'image-basename',
        // Vite's own asset plugin is a core plugin and would run first; `pre` gets ahead of it.
        enforce: 'pre',
        /** @param {string} id */
        load(id) {
          const path = id.split('?')[0] // ignore `?url`-style query suffixes
          if (IMAGE_RE.test(path)) {
            // `width` is the marker the verifier keys on (both `strings()` and the leak check) — keep it.
            return `export default { src: ${JSON.stringify(basename(path))}, width: 0, height: 0, format: 'jpg' }`
          }
        },
      },
    ],
  })
  const names = Object.keys(CONTENT_MODULES)
  try {
    const modules = await Promise.all(names.map((m) => server.ssrLoadModule(`/src/data/${m}.ts`)))
    // Spread out of the module namespace objects so they are plain data.
    return /** @type {any} */ (Object.fromEntries(names.map((m, i) => [m, { ...modules[i] }])))
  } finally {
    await server.close()
  }
}

/**
 * Every string leaf in a value; image-metadata stubs collapse to their `src`.
 * @param {unknown} value
 * @param {Set<string>} [acc]
 */
function strings(value, acc = new Set()) {
  if (typeof value === 'string') acc.add(value)
  else if (Array.isArray(value)) value.forEach((v) => strings(v, acc))
  else if (value && typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value)
    if (typeof obj.src === 'string' && 'width' in obj) acc.add(obj.src)
    else Object.values(obj).forEach((v) => strings(v, acc))
  }
  return acc
}

/**
 * The export's own checks: lossless, every image a bare basename present on disk, the hub's
 * structural rules. Returns the problems and the media files found.
 *
 * @param {string} root
 * @param {import('../dist/contentFile.js').DataModules} data
 * @param {import('../dist/contentFile.js').ContentFile} out
 */
function verify(root, data, out) {
  /** @type {string[]} */
  const problems = []
  // 1. lossless: every string in the source modules survives into the JSON. A media *path* is the
  //    one thing allowed to shrink (an image import arrives as its basename, the hero video is a
  //    `public/` path the hub stores as a basename). Copy still has to survive verbatim.
  const sourceStrings = strings(data)
  const outStrings = strings(out)
  for (const str of sourceStrings) {
    if (!(outStrings.has(str) || (IMAGE_RE.test(str) && outStrings.has(basename(str))))) {
      problems.push(`source string missing from export: ${JSON.stringify(str)}`)
    }
  }
  // 2. every image is a bare basename that exists on disk (basename first — resolving a path
  //    against src/assets/ or public/ could "find" a file and mask the real problem)
  const images = [...outStrings].filter((str) => IMAGE_RE.test(str)).sort()
  /** @type {Map<string, string>} basename → absolute source path */
  const found = new Map()
  for (const file of images) {
    if (file !== basename(file)) {
      problems.push(`image is not a bare basename: ${file}`)
      continue
    }
    const dir = MEDIA_DIRS.find((d) => existsSync(resolve(root, d, file)))
    if (dir) found.set(file, resolve(root, dir, file))
    else problems.push(`image not found in ${MEDIA_DIRS.map((d) => `${d}/`).join(' or ')}: ${file}`)
  }
  // 3. the hub's structural rules, and no ImageMetadata leaking through
  problems.push(...contentFileProblems(out))
  if (JSON.stringify(out).includes('"width"')) problems.push('an ImageMetadata object leaked into the export')
  return { problems, found, images, sourceStrings }
}

/**
 * The hub's `tenant.json` rules (`parseTenant` in its `src/seed/client.ts`).
 * @param {Record<string, unknown>} tenant
 */
function tenantProblems(tenant) {
  const problems = []
  if (typeof tenant.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tenant.slug)) {
    problems.push(`tenant.json: slug must be lowercase kebab-case (got ${JSON.stringify(tenant.slug)})`)
  }
  if (typeof tenant.name !== 'string' || !tenant.name) problems.push('tenant.json: name is required')
  if (tenant.plan !== undefined && !PLANS.includes(/** @type {string} */ (tenant.plan))) {
    problems.push(`tenant.json: plan must be one of ${PLANS.join(', ')} (got ${JSON.stringify(tenant.plan)})`)
  }
  if (tenant.niche !== undefined && !(/** @type {readonly string[]} */ (TRADES)).includes(/** @type {string} */ (tenant.niche))) {
    problems.push(`tenant.json: niche must be one of ${TRADES.join(', ')} (got ${JSON.stringify(tenant.niche)})`)
  }
  return problems
}

/**
 * @param {string} root  The consumer repo.
 * @param {string[]} argv
 */
export async function exportContent(root, argv) {
  const args = parseArgs('export-content', argv, {
    values: ['out', 'media', 'client', 'dir', 'name', 'domain', 'niche', 'plan', 'template', 'repo'],
    flags: ['validate'],
  })
  const slug = args.client
  if (slug !== undefined && (args.out !== undefined || args.media !== undefined)) {
    throw new Error('--client writes its own content.json and media/; drop --out / --media')
  }
  const clientDir = slug !== undefined ? resolve(root, args.dir ?? 'clients', slug) : undefined
  const outFile = clientDir ? resolve(clientDir, 'content.json') : resolve(root, args.out ?? 'content-export/content.json')
  const mediaDir = clientDir ? resolve(clientDir, 'media') : args.media !== undefined ? resolve(root, args.media) : undefined

  const data = await loadDataModules(root)
  const out = toContentFile(data)
  const { problems, found, images, sourceStrings } = verify(root, data, out)

  /** @type {Record<string, unknown> | undefined} */
  let tenant
  if (clientDir) {
    const site = data.site.site
    const pkg = existsSync(resolve(root, 'package.json')) ? JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) : {}
    const existingFile = resolve(clientDir, 'tenant.json')
    const existing = existsSync(existingFile) ? JSON.parse(readFileSync(existingFile, 'utf8')) : {}
    const derived = {
      name: site.name,
      domain: site.business?.siteUrl ? new URL(site.business.siteUrl).hostname : undefined,
      niche: site.business?.trade,
      template: typeof pkg.name === 'string' ? pkg.name.replace(/^@[^/]+\//, '') : undefined,
    }
    const flags = { name: args.name, domain: args.domain, plan: args.plan, niche: args.niche, template: args.template, repo: args.repo }
    // derived < an existing tenant.json < flags; hub key order; unset keys dropped.
    const merged = { ...derived, ...existing, ...Object.fromEntries(Object.entries(flags).filter(([, v]) => v !== undefined)), slug }
    const spec = Object.fromEntries(
      ['slug', 'name', 'domain', 'plan', 'niche', 'template', 'repo', 'deployHookUrl']
        .map((key) => [key, merged[key]])
        .filter(([, v]) => v !== undefined),
    )
    problems.push(...tenantProblems(spec))
    tenant = spec
  }

  if (args.validate) {
    const result = validateSiteContent(toLocalContent(fromContentFile(out)))
    if (!result.ok) problems.push(`content model:\n${formatProblems(result.problems).replace(/^/gm, '  ')}`)
  }

  if (problems.length) throw new Error(`${problems.length} problem(s), nothing written\n  - ${problems.join('\n  - ')}`)

  // ---- write ----------------------------------------------------------------------------------
  const lines = []
  if (clientDir && tenant) {
    mkdirSync(clientDir, { recursive: true })
    writeFileSync(resolve(clientDir, 'tenant.json'), JSON.stringify(tenant, null, 2) + '\n')
    lines.push(`wrote ${relative(root, resolve(clientDir, 'tenant.json'))}`)
  }
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n')
  lines.push(`wrote ${relative(root, outFile)}`)
  lines.push(`  site keys      ${Object.keys(out.site).length}`)
  for (const list of ['services', 'projects', 'testimonials', 'processSteps', 'stats', 'faqs']) {
    lines.push(`  ${list.padEnd(14)} ${/** @type {any} */ (out)[list].length}`)
  }
  lines.push(`  ctaStrip       ${out.site.ctaStrip.length}`)
  lines.push(`  images         ${images.length} unique: ${images.join(', ')}`)
  lines.push(`  strings        ${sourceStrings.size} source strings, all present`)
  if (args.validate) lines.push('  validated      content model OK')
  if (mediaDir) {
    mkdirSync(mediaDir, { recursive: true })
    for (const [file, from] of found) copyFileSync(from, resolve(mediaDir, file))
    lines.push(`  media          ${found.size} file(s) copied to ${relative(root, mediaDir)}/`)
  }
  console.log(lines.join('\n'))
}
