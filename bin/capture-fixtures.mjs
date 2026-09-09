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

const DEFAULT_OUT = 'src/lib/__fixtures__'

/**
 * @param {string} root  The consumer repo.
 * @param {string[]} argv
 */
export async function captureFixtures(root, argv) {
  let outDir = resolve(root, DEFAULT_OUT)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[++i]
    if (value === undefined) throw new Error(`capture-fixtures: ${arg} needs a value`)
    if (arg === '--out') outDir = resolve(root, value)
    else throw new Error(`capture-fixtures: unknown option ${arg}`)
  }

  const base = process.env.PAYLOAD_URL
  const key = process.env.PAYLOAD_API_KEY
  if (!base || !key) throw new Error('export PAYLOAD_URL and PAYLOAD_API_KEY for the tenant to capture')

  mkdirSync(outDir, { recursive: true })
  for (const collection of COLLECTIONS) {
    const url = collectionUrl(base, collection)
    const res = await fetch(url, { headers: { authorization: `users API-Key ${key}` } })
    if (!res.ok) throw new Error(`capture-fixtures: HTTP ${res.status} ${res.statusText} from ${url}`)
    const body = await res.json()
    if (!Array.isArray(body?.docs) || body.docs.length === 0) {
      throw new Error(`capture-fixtures: ${url} returned no documents — is the tenant seeded?`)
    }
    const file = resolve(outDir, `hub-${collection}.json`)
    writeFileSync(file, JSON.stringify(body, null, 2) + '\n')
    console.log(`  hub-${collection}.json`.padEnd(30) + `${body.docs.length} doc(s)`)
  }
  console.log(`captured ${COLLECTIONS.length} collections to ${outDir.replace(`${root}/`, '')}/`)
}
