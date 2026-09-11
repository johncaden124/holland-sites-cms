// @ts-check
/**
 * Export a template's `src/data/*.ts` modules as one JSON document shaped exactly like the hub's
 * Payload collections (`site` + six list collections), for seeding a tenant.
 *
 *   npx site-cms export-content [--out content-export/client.json] [--media content-export/media]
 *
 * Images are reduced to their basenames (`work-1.jpg`); `--media` copies each referenced file out of
 * `src/assets/` or `public/` into one folder, so the JSON and the uploads travel together — that
 * pair is the whole manual half of onboarding a client. List items carry no `order`: the seed
 * assigns 1..n from array position. The script verifies its own output before writing anything.
 *
 * The data modules must stay plain TS with relative image imports (no `astro:*` imports, no path
 * aliases) for this exporter to load them. JSON key order follows the TS source order, so
 * reordering fields in `src/data` produces a diff without a content change.
 */
import { basename, dirname, resolve } from 'node:path'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const IMAGE_RE = /\.(jpe?g|png|webp|avif|mp4)$/
/** Where a referenced media file may live in a template, in the order the exporter looks. */
const MEDIA_DIRS = ['src/assets', 'public']

/**
 * Vite, resolved from the *consumer's* `package.json` rather than from this package's own directory.
 *
 * This script has no `vite` dependency of its own and must not grow one: it has to drive the same
 * Vite the consumer's Astro uses. Resolving from `import.meta.url` would search this package's
 * `node_modules` and then walk up — which happened to work while the script lived in the template
 * and npm hoisted Astro's vite to the top level, and stops working the moment the script is inside
 * an installed package (pnpm, or a nested install). `createRequire` on the consumer's manifest
 * resolves exactly what the consumer's own `import('vite')` would.
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
      `export-content: cannot resolve "vite" from ${root} — it comes with astro, so run this from a` +
        ' repo that has astro installed (npm install first).',
    )
  }
  return import(pathToFileURL(entry).href)
}

/**
 * @param {string} root  The consumer repo.
 * @param {string[]} argv
 */
export async function exportContent(root, argv) {
  let outFile = resolve(root, 'content-export/content.json')
  /** @type {string | undefined} */
  let mediaDir
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[++i]
    if (value === undefined) throw new Error(`export-content: ${arg} needs a value`)
    if (arg === '--out') outFile = resolve(root, value)
    else if (arg === '--media') mediaDir = resolve(root, value)
    else throw new Error(`export-content: unknown option ${arg}`)
  }

  const { createServer } = await loadVite(root)

  // ---- load the data modules through Vite, short-circuiting image imports ---------------------
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
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
  const moduleNames = ['site', 'hero', 'about', 'cta', 'services', 'gallery', 'testimonials', 'process', 'stats', 'faqs']
  /** @type {Record<string, any>[]} */
  let modules
  try {
    modules = await Promise.all(moduleNames.map((m) => server.ssrLoadModule(`/src/data/${m}.ts`)))
  } finally {
    await server.close()
  }
  /** Loaded modules keyed by name: `data.site.site`, `data.process.processSteps`, … */
  const data = Object.fromEntries(moduleNames.map((m, i) => [m, modules[i]]))

  // ---- project onto the hub's schema ----------------------------------------------------------
  /** @param {{ src: string }} m */
  const img = (m) => m.src
  /** @param {string[]} list */
  const texts = (list) => list.map((text) => ({ text }))
  const s = data.site.site
  const h = data.hero.hero

  const out = {
    site: {
      // Brand
      name: s.name,
      tagline: s.tagline,
      description: s.description,
      heroHeadline: s.heroHeadline,
      // Optional throughout: a key the template never set must stay absent, or the hub would store
      // an empty string and the mapper would hand it back as content nobody wrote.
      ...(s.heroEyebrow ? { heroEyebrow: s.heroEyebrow } : {}),
      ...(s.licenseNumber ? { licenseNumber: s.licenseNumber } : {}),
      nav: s.nav,
      navCta: s.navCta,
      heroCta: s.heroCta,
      labels: s.labels,
      socials: s.socials,
      footer: s.footer,
      copyright: s.copyright,
      // Hero. The poster and avatars are image imports and the video is a `public/` path, so all
      // three come from `src/data/hero.ts` — hard-coding the basenames here (as this did) forced
      // every template on the hub to ship exactly `hero.mp4`, `hero-poster.jpg` and three avatars
      // named `avatar-1..3.jpg`, whatever its own assets were actually called.
      heroPhone: s.heroPhone,
      ...(h.video ? { heroVideo: basename(h.video) } : {}),
      heroPoster: img(h.poster),
      avatars: h.avatars.map((/** @type {{ src: string }} */ a) => ({ image: img(a) })),
      review: s.review,
      heroBadge: s.heroBadge,
      // About
      aboutHeading: data.about.aboutHeading,
      trustCard: { ...data.about.trustCard, bullets: texts(data.about.trustCard.bullets) },
      aboutCards: data.about.aboutCards,
      // Sections
      servicesIntro: data.services.servicesIntro,
      workIntro: data.gallery.workIntro,
      featuredProject: data.gallery.featuredProject,
      testimonialsIntro: data.testimonials.testimonialsIntro,
      impactIntro: data.stats.impactIntro,
      processIntro: data.process.processIntro,
      faqIntro: data.faqs.faqIntro,
      faqSideCard: data.faqs.faqSideCard,
      ctaBand: data.cta.ctaBand,
      ctaStrip: data.gallery.ctaStrip.map((/** @type {any} */ c) => ({ image: img(c.image), alt: c.alt })),
    },
    services: data.services.services.map((/** @type {any} */ x) => ({ ...x, image: img(x.image), bullets: texts(x.bullets) })),
    projects: data.gallery.gallery.map((/** @type {any} */ g) => ({ image: img(g.image), alt: g.alt, emphasis: g.emphasis })),
    // `image` / `beforeImage` are optional: a niche with no before/after photography omits them, and
    // an omitted key must not survive as an ImageMetadata stub.
    testimonials: data.testimonials.testimonials.map((/** @type {any} */ t) => {
      const doc = { ...t }
      for (const key of ['image', 'beforeImage']) {
        if (doc[key]) doc[key] = img(doc[key])
        else delete doc[key]
      }
      return doc
    }),
    processSteps: data.process.processSteps,
    stats: data.stats.stats,
    faqs: data.faqs.faqs,
  }
  const LISTS = /** @type {const} */ (['services', 'projects', 'testimonials', 'processSteps', 'stats', 'faqs'])

  // ---- verify ---------------------------------------------------------------------------------
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

  /** @type {string[]} */
  const problems = []
  /** @param {boolean} ok @param {string} msg */
  const check = (ok, msg) => { if (!ok) problems.push(msg) }

  // 1. lossless: every string in the source modules survives into the JSON. A media *path* is the
  //    one thing allowed to shrink — an image import already arrives here as its basename, and the
  //    hero video is a `public/` path (`/hero.mp4`) that the hub stores as `hero.mp4` — so accept
  //    either form for those. Copy still has to survive verbatim, which is what this guards.
  const sourceStrings = strings(Object.fromEntries(Object.entries(data).map(([name, m]) => [name, { ...m }])))
  const outStrings = strings(out)
  for (const str of sourceStrings) {
    const survived = outStrings.has(str) || (IMAGE_RE.test(str) && outStrings.has(basename(str)))
    check(survived, `source string missing from export: ${JSON.stringify(str)}`)
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

  // 3. shapes the hub schema pins down
  check(out.site.ctaStrip.length === data.gallery.ctaStrip.length, `ctaStrip.length = ${out.site.ctaStrip.length}, expected ${data.gallery.ctaStrip.length}`)
  check(out.projects.length === data.gallery.gallery.length, `projects.length = ${out.projects.length}, expected ${data.gallery.gallery.length}`)
  for (const list of LISTS) {
    check(out[list].every((/** @type {object} */ item) => !('order' in item)), `${list}: items must not carry "order"`)
  }
  check(!JSON.stringify(out).includes('"width"'), 'an ImageMetadata object leaked into the export')

  if (problems.length) {
    console.error(`export-content: ${problems.length} problem(s)\n  - ${problems.join('\n  - ')}`)
    process.exit(1)
  }

  // ---- write ----------------------------------------------------------------------------------
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n')

  const rel = (/** @type {string} */ p) => p.replace(`${root}/`, '')
  console.log(`wrote ${rel(outFile)}`)
  console.log(`  site keys      ${Object.keys(out.site).length}`)
  for (const list of LISTS) {
    console.log(`  ${list.padEnd(14)} ${out[list].length}`)
  }
  console.log(`  ctaStrip       ${out.site.ctaStrip.length}`)
  console.log(`  images         ${images.length} unique: ${images.join(', ')}`)
  console.log(`  strings        ${sourceStrings.size} source strings, all present`)

  if (mediaDir) {
    mkdirSync(mediaDir, { recursive: true })
    for (const [file, from] of found) copyFileSync(from, resolve(mediaDir, file))
    console.log(`  media          ${found.size} file(s) copied to ${rel(mediaDir)}/`)
  }
}
