// @ts-check
/**
 * Prove the `./service-icons` subpath is what the hub needs it to be: importable from plain Node with
 * no Astro and no DOM. The hub is a Next/Payload app; if this subpath ever pulled in `astro` (or
 * anything that expects a browser), pnpm would drag Astro into the hub again, or the import would
 * fail on the server.
 *
 *   node scripts/check-service-icons.mjs     (after npm run build)
 *
 * In a child Node process with no loader, bundler or Astro in the way, it
 * 1. records every module the import resolves, through `module.registerHooks`, and requires that the
 *    subpath loads exactly one file;
 * 2. traps the DOM globals (`window`, `document`, `navigator`, `HTMLElement`, `customElements`) and
 *    requires that none is touched;
 * 3. requires the published `.d.ts` to reference no other module, so its *types* cannot pull in a
 *    peer either.
 * It imports the package by its own name, so the `exports` map is exercised too.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const probe = `
import { registerHooks } from 'node:module';
const loaded = [];
registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context);
    loaded.push(result.url);
    return result;
  },
});
const touched = [];
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'customElements']) {
  Object.defineProperty(globalThis, name, { configurable: true, get() { touched.push(name); return undefined; } });
}
const mod = await import('@hollandtech/site-cms/service-icons');
console.log(JSON.stringify({ loaded, touched, exports: Object.keys(mod), count: mod.SERVICE_ICONS.length }));
`

const child = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: ROOT, encoding: 'utf8' })
if (child.status !== 0) {
  console.error(`check-service-icons: importing @hollandtech/site-cms/service-icons failed:\n${child.stderr}`)
  process.exit(1)
}
const { loaded, touched, exports, count } = JSON.parse(child.stdout)
const problems = []
const expected = new URL('../dist/serviceIcons.js', import.meta.url).href
if (loaded.length !== 1 || loaded[0] !== expected) {
  problems.push(`loads ${loaded.length} module(s), expected only dist/serviceIcons.js:\n    ${loaded.join('\n    ')}`)
}
if (touched.length) problems.push(`touches DOM globals: ${touched.join(', ')}`)
if (!exports.includes('SERVICE_ICONS') || !(count > 0)) problems.push('does not export a non-empty SERVICE_ICONS')
const dts = readFileSync(resolve(ROOT, 'dist/serviceIcons.d.ts'), 'utf8')
if (/\bimport\b|\brequire\(|reference\s+types/.test(dts)) problems.push('dist/serviceIcons.d.ts references another module')

if (problems.length) {
  console.error(`check-service-icons:\n  - ${problems.join('\n  - ')}`)
  process.exit(1)
}
console.log(`service-icons OK — 1 module, no DOM globals, ${count} icons, self-contained .d.ts`)
