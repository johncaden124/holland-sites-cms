// @ts-check
/**
 * A change to the public contract must ship with the version bump it calls for, so no consumer
 * picks up a type change under a version that promised none.
 *
 *   node scripts/check-version-bump.mjs [--base <git-ref>]
 *
 * The contract is what `etc/*.api.md` (every exported type and signature) and
 * `schema/site-content.schema.json` (the content model) say, compared with the base ref — on a pull
 * request `origin/$GITHUB_BASE_REF`, otherwise `--base`. Documentation inside those files (doc
 * comments in the reports, `description`s in the schema) is not contract: a doc-only change needs no
 * bump (`contract.mjs` says exactly what is ignored). For everything else the rule is:
 *
 * - **Before 1.0** (`0.y.z`): any change needs at least a **minor** bump (`0.6.0 → 0.7.0`). A patch
 *   bump is refused, because consumers pin `#v0.y.z` tags and a `0.y` line is the only
 *   compatibility promise there is.
 * - **From 1.0**: a change that only adds lines needs a minor bump; one that removes or alters any
 *   line (a removed field, a narrowed union, a changed signature) needs a **major** bump.
 *
 * With no base (a push to main, a local run without `--base`) there is nothing to compare, and the
 * check passes saying so.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareContract } from './contract.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT = ['etc', 'schema']

const argIndex = process.argv.indexOf('--base')
const base =
  argIndex > -1 ? process.argv[argIndex + 1] : process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined
if (!base) {
  console.log('check-version-bump: no base ref (not a pull request) — nothing to compare')
  process.exit(0)
}

const git = (/** @type {string[]} */ ...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })

/** @param {string} v */
const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v)
  if (!m) throw new Error(`not a semver version: ${v}`)
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
}

/** The contract files at `ref`, path → text. */
const atRef = (/** @type {string} */ ref) =>
  Object.fromEntries(
    git('ls-tree', '-r', '--name-only', ref, '--', ...CONTRACT)
      .split('\n')
      .filter(Boolean)
      .map((path) => [path, git('show', `${ref}:${path}`)]),
  )
/** The contract files in the working tree, path → text. */
const inTree = () =>
  Object.fromEntries(
    git('ls-files', '--cached', '--others', '--exclude-standard', '--', ...CONTRACT)
      .split('\n')
      .filter(Boolean)
      .map((path) => [path, readFileSync(resolve(ROOT, path), 'utf8')]),
  )

const headVersion = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version
const baseVersion = JSON.parse(git('show', `${base}:package.json`)).version
const { changed, docOnly, removesOrAlters } = compareContract(atRef(base), inTree())

if (!changed.length) {
  console.log(
    docOnly.length
      ? `check-version-bump: documentation-only change since ${base} (${docOnly.join(', ')}) — no bump needed (${headVersion})`
      : `check-version-bump: the contract is unchanged since ${base} — any version is fine (${headVersion})`,
  )
  process.exit(0)
}

const from = parse(baseVersion)
const to = parse(headVersion)
const bumped = {
  major: to.major > from.major,
  minor: to.major === from.major && to.minor > from.minor,
}

/** @type {'minor' | 'major'} */
const needed = from.major === 0 ? 'minor' : removesOrAlters ? 'major' : 'minor'
const ok = needed === 'major' ? bumped.major : bumped.major || bumped.minor

if (!ok) {
  console.error(
    `check-version-bump: the contract changed since ${base} (${changed.join(', ')}), which needs a ${needed} bump` +
      ` from ${baseVersion}${from.major === 0 ? ' (pre-1.0: any contract change is a minor)' : removesOrAlters ? ' (lines were removed or altered)' : ''},` +
      ` but package.json says ${headVersion}. Bump it and add a CHANGELOG entry.`,
  )
  process.exit(1)
}
console.log(`check-version-bump: contract changed (${changed.join(', ')}); ${baseVersion} → ${headVersion} is a ${needed} bump or more — OK`)
