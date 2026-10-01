#!/usr/bin/env node
// @ts-check
/**
 * The shared CMS tooling, run from a template or client repo (or, for `new-site`, from anywhere):
 *
 *   npx site-cms parity            CMS build vs standalone build, normalised and diffed
 *   npx site-cms export-content    src/data/*.ts  →  hub content file (+ tenant.json, media/)
 *   npx site-cms import-content    hub content file  →  src/data/*.ts
 *   npx site-cms new-site          content file + template  →  a client repo's working tree
 *   npx site-cms capture-fixtures  the hub's REST responses  →  test fixtures
 *
 * Every command works on `process.cwd()`, the consumer repo — never on this package's own directory.
 *
 * The contract every command keeps, because the generator shells out to them: `--help` prints the
 * command's usage and exits 0; a failure exits 1 and prints **only** the error, to stderr, with
 * nothing on stdout; success prints its summary to stdout.
 */
import * as parity from './parity.mjs'
import * as exportContent from './export-content.mjs'
import * as importContent from './import-content.mjs'
import * as newSite from './new-site.mjs'
import * as captureFixtures from './capture-fixtures.mjs'

const COMMANDS = {
  parity: { run: parity.parity, help: parity.HELP },
  'export-content': { run: exportContent.exportContent, help: exportContent.HELP },
  'import-content': { run: importContent.importContent, help: importContent.HELP },
  'new-site': { run: newSite.newSite, help: newSite.HELP },
  'capture-fixtures': { run: captureFixtures.captureFixtures, help: captureFixtures.HELP },
}

const USAGE = `site-cms <command> [options]

  parity             build with and without the hub, and diff the pages
  export-content     export src/data/*.ts as a hub content file (+ tenant.json and media/)
  import-content     write src/data/*.ts from a hub content file
  new-site           clone a template at its pinned ref and fill it from a content file
  capture-fixtures   capture the hub's REST responses as test fixtures

site-cms <command> --help for a command's options and the environment it reads.`

const isHelp = (/** @type {string | undefined} */ arg) => arg === '--help' || arg === '-h'

const [command, ...argv] = process.argv.slice(2)
if (isHelp(command)) {
  console.log(USAGE)
  process.exit(0)
}
if (!command) {
  console.error(USAGE)
  process.exit(1)
}
const entry = COMMANDS[/** @type {keyof typeof COMMANDS} */ (command)]
if (!entry) {
  console.error(`site-cms: unknown command "${command}" (site-cms --help lists them)`)
  process.exit(1)
}
if (argv.some(isHelp)) {
  console.log(entry.help)
  process.exit(0)
}

try {
  await entry.run(process.cwd(), argv)
} catch (err) {
  console.error(`site-cms ${command}: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
