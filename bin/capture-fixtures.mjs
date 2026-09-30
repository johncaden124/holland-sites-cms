// @ts-check
/**
 * Capture the hub's REST responses verbatim, as the test fixtures every assertion about mapping runs
 * against.
 *
 *   PAYLOAD_URL=http://localhost:3000 PAYLOAD_API_KEY=… npx site-cms capture-fixtures [--out dir]
 *
 * The URL comes from `collectionUrl` in `dist/cms.js` — the same function the fetch layer calls — so
 * a fixture is byte-for-byte what a build would have received, not an approximation of it.
 *
 * **Nothing is stripped.** `tenant`, media `url`s and array-row `id`s all look like noise and are all
 * read by assertions: the tenant-scoping tests build two-tenant responses out of the captured
 * tenant, the media-origin tests rewrite the captured `url`s, and the mappers are asserted to *drop*
 * the row `id`s. A tidied fixture would quietly make those tests vacuous.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COLLECTIONS, collectionUrl } from '../dist/cms.js'
import { parseArgs, relative } from './args.mjs'

const DEFAULT_OUT = 'src/lib/__fixtures__'

export const HELP = `site-cms capture-fixtures — the hub's REST responses → test fixtures, verbatim

Usage:
  PAYLOAD_URL=… PAYLOAD_API_KEY=… site-cms capture-fixtures [--out dir]

GETs each of the seven collections at exactly the URL a build requests and writes
hub-<collection>.json to --out (default ${DEFAULT_OUT}). Nothing is written unless all
seven succeed.

Environment:
  PAYLOAD_URL       the hub origin (http://localhost:3000 for a local hub)
  PAYLOAD_API_KEY   the tenant's build-bot key (in the hub: pnpm bot-key <slug>)`

/**
 * @param {string} root  The consumer repo.
 * @param {string[]} argv
 */
export async function captureFixtures(root, argv) {
  const args = parseArgs('capture-fixtures', argv, { values: ['out'] })
  const outDir = resolve(root, args.out ?? DEFAULT_OUT)

  const base = process.env.PAYLOAD_URL
  const key = process.env.PAYLOAD_API_KEY
  if (!base || !key) throw new Error('export PAYLOAD_URL and PAYLOAD_API_KEY for the tenant to capture (see --help)')

  // Everything fetched before anything is written, so a failure leaves the old fixtures intact.
  /** @type {[string, any][]} */
  const captured = []
  for (const collection of COLLECTIONS) {
    const url = collectionUrl(base, collection)
    let res
    try {
      res = await fetch(url, { headers: { authorization: `users API-Key ${key}` } })
    } catch (err) {
      const e = /** @type {{ cause?: { code?: string, message?: string }, message?: string }} */ (err)
      throw new Error(`could not reach ${url} (${e.cause?.code ?? e.cause?.message ?? e.message}) — check PAYLOAD_URL`)
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`)
    const body = await res.json()
    if (!Array.isArray(body?.docs) || body.docs.length === 0) {
      throw new Error(`${url} returned no documents — is the tenant seeded?`)
    }
    captured.push([collection, body])
  }

  mkdirSync(outDir, { recursive: true })
  const lines = []
  for (const [collection, body] of captured) {
    writeFileSync(resolve(outDir, `hub-${collection}.json`), JSON.stringify(body, null, 2) + '\n')
    lines.push(`  hub-${collection}.json`.padEnd(30) + `${body.docs.length} doc(s)`)
  }
  lines.push(`captured ${COLLECTIONS.length} collections to ${relative(root, outDir)}/`)
  console.log(lines.join('\n'))
}
