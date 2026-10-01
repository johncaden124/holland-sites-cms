// @ts-check
/**
 * One command from a content file to a client repo's working tree — the command the generator
 * repo shells out to.
 *
 *   npx site-cms new-site --from clients/acme-hvac/content.json --template template-hvac --out ../acme-hvac
 *
 * 1. Clone the template at its pinned ref (from this package's `consumers.json`, or `--ref`) and
 *    drop its history: the output is a new repo's first tree, not a fork of the template.
 * 2. `import-content` the file into it, media from `--media` or the `media/` folder next to it.
 * 3. Set `CMS_REQUIRED` in `src/lib/cms.config.ts` — `true` unless `--no-cms-required`, because a
 *    client repo must never publish the template's placeholder content.
 * 4. Point `.env.example` at the hub: `PAYLOAD_URL`, `PUBLIC_MEDIA_HOST`, and `PUBLIC_SITE_URL` from
 *    `business.siteUrl`. Every other variable in the template's copy is kept as it is.
 * 5. `git init -b main` and make one first commit, "Create <dir> from <repo>@<ref>", so the new repo
 *    records which template commit it came from — the template's own history is dropped in step 1,
 *    and this is the only place that provenance survives — and later template upgrades have a
 *    baseline to diff against. `--no-git` leaves a plain directory. No remote, no push: creating the
 *    client's GitHub repo is the generator's job.
 *
 * Nothing is left behind on failure: the output directory is removed if any step fails.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_MEDIA_HOST } from '../dist/mediaOrigins.js'
import { importInto } from './import-content.mjs'
import { parseArgs, relative } from './args.mjs'

export const DEFAULT_HUB_URL = 'https://hub.hollandsites.com'
const CONSUMERS = resolve(dirname(fileURLToPath(import.meta.url)), '../consumers.json')

export const HELP = `site-cms new-site — content file + template → a client repo's working tree

Usage:
  site-cms new-site --from <content.json> --template <name|owner/repo|git-url> --out <dir>
                    [--ref <sha|tag>] [--media dir] [--hub url] [--no-cms-required] [--no-git]

--template  a name from this package's consumers.json (cloned at its pinned ref), or any
            owner/repo or git URL together with --ref.
--media     defaults to the media/ folder next to the content file.
--hub       PAYLOAD_URL written to .env.example (default ${DEFAULT_HUB_URL}).
--no-cms-required  leave CMS_REQUIRED false (a demo, not a client site).
--no-git    don't initialise a git repository; by default the output is a repo on main with
            one commit, "Create <dir> from <template>@<ref>" (no remote is added).

A private template is cloned with SITE_CMS_GIT_TOKEN (a GitHub token with read access to it)
when set, otherwise with git's own credentials. --out must not exist, or be empty.`

/**
 * @param {string} template
 * @param {string | undefined} ref
 * @returns {{ url: string, ref: string, label: string }}
 */
function resolveTemplate(template, ref) {
  /** @type {{ templates: { name: string, repo: string, ref: string }[] }} */
  const registry = JSON.parse(readFileSync(CONSUMERS, 'utf8'))
  const known = registry.templates.find((t) => t.name === template || t.repo === template)
  const isUrl = /^(https?|file|ssh|git):\/\//.test(template) || template.startsWith('/') || template.startsWith('.')
  const repo = known?.repo ?? (!isUrl && /^[\w.-]+\/[\w.-]+$/.test(template) ? template : undefined)
  if (!known && !repo && !isUrl) {
    throw new Error(
      `unknown template "${template}" — use one of ${registry.templates.map((t) => t.name).join(', ')}, an owner/repo, or a git URL`,
    )
  }
  const pinned = ref ?? known?.ref
  if (!pinned) throw new Error(`--template ${template} is not in consumers.json, so it needs --ref <sha|tag>`)
  const token = process.env.SITE_CMS_GIT_TOKEN
  const url = repo
    ? token
      ? `https://x-access-token:${token}@github.com/${repo}.git`
      : `https://github.com/${repo}.git`
    : template
  return { url, ref: pinned, label: `${repo ?? template}@${pinned}` }
}

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string} stdout
 */
function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
  } catch (err) {
    const stderr = String(/** @type {{ stderr?: Buffer }} */ (err).stderr ?? '').trim()
    // Never echo a token back, whichever line git put it on.
    const token = process.env.SITE_CMS_GIT_TOKEN
    const safe = token ? stderr.split(token).join('***') : stderr
    // Name the subcommand, not a leading `-c key=value` override.
    const sub = args.find((arg, i) => !arg.startsWith('-') && args[i - 1] !== '-c') ?? args[0]
    throw new Error(`git ${sub} failed${safe ? `: ${safe.split('\n').pop()}` : ''}`)
  }
}

/**
 * `KEY=value` set in place when the template's `.env.example` has the key, appended otherwise.
 * @param {string} text
 * @param {Record<string, string>} values
 */
export function setEnv(text, values) {
  let out = text
  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^${key}=.*$`, 'm')
    out = line.test(out)
      ? out.replace(line, `${key}=${value}`)
      : `${out && !out.endsWith('\n') ? `${out}\n` : out}${key}=${value}\n`
  }
  return out
}

const CMS_REQUIRED_RE = /^export const CMS_REQUIRED(: boolean)? = (true|false);$/m

/** Who the first commit is by when the machine has no git identity (a bare CI runner, a container). */
const FALLBACK_IDENTITY = ['-c', 'user.name=site-cms', '-c', 'user.email=site-cms@hollandsites.com']

/**
 * `git config <key>` as git itself resolves it there, or '' when unset.
 * @param {string} key
 * @param {string} cwd
 */
function gitConfig(key, cwd) {
  try {
    return execFileSync('git', ['config', key], { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

/**
 * @param {string} cwd
 * @param {string[]} argv
 */
export async function newSite(cwd, argv) {
  const args = parseArgs('new-site', argv, {
    values: ['from', 'template', 'out', 'ref', 'media', 'hub'],
    flags: [],
    negatable: ['cms-required', 'git'],
  })
  for (const required of /** @type {const} */ (['from', 'template', 'out'])) {
    if (!args[required]) throw new Error(`--${required} is required (see site-cms new-site --help)`)
  }
  const from = resolve(cwd, /** @type {string} */ (args.from))
  const out = resolve(cwd, /** @type {string} */ (args.out))
  const cmsRequired = args['cms-required'] !== false
  const initGit = args.git !== false
  if (!existsSync(from)) throw new Error(`content file not found: ${from}`)
  if (existsSync(out) && readdirSync(out).length) throw new Error(`${out} already exists and is not empty`)
  const template = resolveTemplate(/** @type {string} */ (args.template), args.ref)
  const siblingMedia = resolve(dirname(from), 'media')
  const mediaDir = args.media !== undefined ? resolve(cwd, args.media) : existsSync(siblingMedia) ? siblingMedia : undefined

  const createdOut = !existsSync(out)
  try {
    // 1. the template at its pinned ref, without history. `fetch <ref>` takes a SHA or a tag alike.
    mkdirSync(out, { recursive: true })
    git(['init', '--quiet'], out)
    git(['fetch', '--quiet', '--depth', '1', template.url, template.ref], out)
    git(['checkout', '--quiet', 'FETCH_HEAD'], out)
    rmSync(resolve(out, '.git'), { recursive: true, force: true })

    // 2. the content
    const lines = importInto(out, from, mediaDir)

    // 3. CMS_REQUIRED
    const configFile = resolve(out, 'src/lib/cms.config.ts')
    const config = existsSync(configFile) ? readFileSync(configFile, 'utf8') : ''
    if (!CMS_REQUIRED_RE.test(config)) {
      throw new Error(
        `${relative(out, configFile)} has no "export const CMS_REQUIRED: boolean = …;" line to set — is this a site-cms template?`,
      )
    }
    writeFileSync(configFile, config.replace(CMS_REQUIRED_RE, `export const CMS_REQUIRED$1 = ${cmsRequired};`))

    // 4. .env.example
    const content = JSON.parse(readFileSync(from, 'utf8'))
    const siteUrl = content.site?.business?.siteUrl ?? ''
    const envFile = resolve(out, '.env.example')
    const env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
    writeFileSync(
      envFile,
      setEnv(env, {
        PAYLOAD_URL: args.hub ?? DEFAULT_HUB_URL,
        PAYLOAD_API_KEY: '',
        PUBLIC_MEDIA_HOST: DEFAULT_MEDIA_HOST,
        PUBLIC_SITE_URL: siteUrl,
      }),
    )

    // 5. a repository with one commit that names its template
    let commit = ''
    if (initGit) {
      const name = relative(dirname(out), out)
      git(['init', '--quiet', '-b', 'main'], out)
      git(['add', '-A'], out)
      const identity = gitConfig('user.name', out) && gitConfig('user.email', out) ? [] : FALLBACK_IDENTITY
      git([...identity, 'commit', '--quiet', '--no-verify', '-m', `Create ${name} from ${template.label}`], out)
      commit = git(['rev-parse', '--short', 'HEAD'], out).trim()
    }

    console.log(
      [
        `created ${relative(cwd, out)} from ${template.label}`,
        ...lines,
        `  CMS_REQUIRED   ${cmsRequired}`,
        `  .env.example   PAYLOAD_URL, PUBLIC_MEDIA_HOST${siteUrl ? ', PUBLIC_SITE_URL' : ' (PUBLIC_SITE_URL left empty: no business.siteUrl)'}`,
        `  git            ${initGit ? `main @ ${commit} (no remote)` : 'not initialised (--no-git)'}`,
      ].join('\n'),
    )
  } catch (err) {
    if (createdOut) rmSync(out, { recursive: true, force: true })
    else for (const entry of readdirSync(out)) rmSync(resolve(out, entry), { recursive: true, force: true })
    throw err
  }
}
