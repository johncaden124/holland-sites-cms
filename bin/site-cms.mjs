#!/usr/bin/env node
// @ts-check
/**
 * The shared CMS tooling, run from a template or client repo:
 *
 *   npx site-cms parity            CMS build vs standalone build, normalised and diffed
 *   npx site-cms export-content    src/data/*.ts  →  hub-shaped seed JSON (+ its media)
 *   npx site-cms capture-fixtures  the hub's REST responses  →  test fixtures
 *
 * Every command works on `process.cwd()`, the consumer repo — never on this package's own directory.
 */
import { parity } from './parity.mjs'
import { exportContent } from './export-content.mjs'
import { captureFixtures } from './capture-fixtures.mjs'

const USAGE = `site-cms <command>

  parity                                    build with and without the hub, and diff the pages
  export-content [--out f] [--media dir]    export src/data/*.ts as hub-shaped seed JSON
  capture-fixtures [--out dir]              capture the hub's REST responses as test fixtures

parity and capture-fixtures read PAYLOAD_URL and PAYLOAD_API_KEY from the environment.
parity also inherits the rest of it into BOTH builds, so anything the consumer's own build
requires (PUBLIC_SITE_URL, say) must be exported too, and with one value.`

const COMMANDS = {
  parity,
  'export-content': exportContent,
  'capture-fixtures': captureFixtures,
}

const [command, ...argv] = process.argv.slice(2)
if (!command || command === '--help' || command === '-h') {
  console.log(USAGE)
  process.exit(command ? 0 : 1)
}
const run = COMMANDS[/** @type {keyof typeof COMMANDS} */ (command)]
if (!run) {
  console.error(`site-cms: unknown command "${command}"\n\n${USAGE}`)
  process.exit(1)
}

try {
  await run(process.cwd(), argv)
} catch (err) {
  console.error(`site-cms ${command}: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
