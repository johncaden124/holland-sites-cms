// @ts-check
/**
 * The public API, as committed text: one API Extractor report per published entry point, in `etc/`.
 *
 *   node scripts/api-report.mjs           regenerate etc/*.api.md (after npm run build)
 *   node scripts/api-report.mjs --check   fail if any report differs from the committed one
 *
 * Every exported name and type signature a consumer can reach is in these files, so any change to
 * the API — a renamed field, a narrowed union, a new export — is a visible diff in review, and CI
 * fails until the report is regenerated and committed. `check-version-bump.mjs` then requires the
 * version bump that change calls for (README → Release flow).
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Extractor, ExtractorConfig, ExtractorLogLevel } from '@microsoft/api-extractor'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

/** Every `exports` entry backed by a `.d.ts`, as `[report name, dist file]`. */
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const ENTRIES = Object.entries(pkg.exports)
  .filter(([, target]) => typeof target === 'object' && target.types)
  .map(([subpath, target]) => [subpath === '.' ? 'index' : subpath.slice(2), target.types])

const temp = resolve(ROOT, 'temp/api')
mkdirSync(temp, { recursive: true })
mkdirSync(resolve(ROOT, 'etc'), { recursive: true })
const failed = []
for (const [name, types] of ENTRIES) {
  const config = ExtractorConfig.prepare({
    configObject: {
      projectFolder: ROOT,
      mainEntryPointFilePath: resolve(ROOT, types),
      compiler: { tsconfigFilePath: resolve(ROOT, 'tsconfig.json') },
      apiReport: { enabled: true, reportFileName: `${name}.api.md`, reportFolder: resolve(ROOT, 'etc'), reportTempFolder: temp },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
      messages: {
        // The report is the point; TSDoc style and "forgotten export" are not what this gate is for.
        extractorMessageReporting: {
          default: { logLevel: ExtractorLogLevel.None },
          'ae-missing-release-tag': { logLevel: ExtractorLogLevel.None },
          'ae-forgotten-export': { logLevel: ExtractorLogLevel.None },
        },
        tsdocMessageReporting: { default: { logLevel: ExtractorLogLevel.None } },
        compilerMessageReporting: { default: { logLevel: ExtractorLogLevel.Warning } },
      },
    },
    configObjectFullPath: resolve(ROOT, 'api-extractor.json'),
    packageJsonFullPath: resolve(ROOT, 'package.json'),
  })
  const result = Extractor.invoke(config, { localBuild: !check, showVerboseMessages: false, messageCallback: (m) => {
    if (m.logLevel === 'warning' || m.logLevel === 'error') {
      m.handled = true
      console.error(`${name}: ${m.text}`)
    } else m.handled = true
  } })
  if (!result.succeeded || (check && result.apiReportChanged)) failed.push(name)
}
rmSync(resolve(ROOT, 'temp'), { recursive: true, force: true })

if (failed.length) {
  console.error(
    check
      ? `api-report: the public API changed in ${failed.map((n) => `etc/${n}.api.md`).join(', ')} — run npm run api:report, commit the reports, and bump the version (README → Release flow)`
      : `api-report: failed for ${failed.join(', ')}`,
  )
  process.exit(1)
}
console.log(`api-report: ${ENTRIES.length} entry points ${check ? 'unchanged' : 'written to etc/'}`)
