// @ts-check
/**
 * The reverse of `export-content`: write a template's `src/data/*.ts` from a content file.
 *
 *   npx site-cms import-content <content.json> [--root .] [--media dir]
 *
 * This is what the generator calls to fill a fresh template fork (and what `new-site` runs). The
 * file is checked before anything is written — the hub's structural rules, then the content model —
 * and every referenced image must end up in `src/assets/` (the hero video in `public/`), copied from
 * `--media` when given. The modules are rendered by `renderDataModules` in one fixed format, so
 * re-importing the same content is byte-identical.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contentFileMedia, contentFileProblems, fromContentFile, renderDataModules, toLocalContent } from '../dist/contentFile.js'
import { formatProblems, validateSiteContent } from '../dist/validate.js'
import { parseArgs, relative } from './args.mjs'

export const HELP = `site-cms import-content — a hub content file → src/data/*.ts

Usage:
  site-cms import-content <content.json> [--root dir] [--media dir]

Writes the ten src/data modules of the template at --root (default: the current directory),
overwriting them. --media copies every referenced file in: images to src/assets/, the hero
video to public/. Fails, writing nothing, if the file breaks the hub's rules or the content
model, or if a referenced image is in neither --media nor the template already.`

/**
 * Read, check and render a content file. Pure apart from the read; used by `new-site` too.
 * @param {string} file
 */
export function prepareImport(file) {
  if (!existsSync(file)) throw new Error(`content file not found: ${file}`)
  /** @type {unknown} */
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${err instanceof Error ? err.message : err}`)
  }
  const structural = contentFileProblems(raw)
  if (structural.length) throw new Error(`${file}: ${structural.length} problem(s)\n  - ${structural.join('\n  - ')}`)
  const content = /** @type {import('../dist/contentFile.js').ContentFile} */ (raw)
  const data = fromContentFile(content)
  const result = validateSiteContent(toLocalContent(data))
  if (!result.ok) {
    throw new Error(`${file} does not match the content model — ${result.problems.length} problem(s):\n${formatProblems(result.problems)}`)
  }
  return { content, files: renderDataModules(data), media: contentFileMedia(content) }
}

/**
 * @param {string} root
 * @param {{ images: string[], videos: string[] }} media
 * @param {string | undefined} mediaDir
 */
function placeMedia(root, media, mediaDir) {
  const wanted = [
    ...media.images.map((file) => ({ file, dir: 'src/assets' })),
    ...media.videos.map((file) => ({ file, dir: 'public' })),
  ]
  const missing = wanted.filter(
    ({ file, dir }) => !(mediaDir && existsSync(resolve(mediaDir, file))) && !existsSync(resolve(root, dir, file)),
  )
  if (missing.length) {
    const where = mediaDir ? `${mediaDir}/ or the template` : 'the template (pass --media <dir>)'
    throw new Error(`${missing.length} referenced file(s) in neither ${where}: ${missing.map((m) => m.file).join(', ')}`)
  }
  let copied = 0
  if (mediaDir) {
    for (const { file, dir } of wanted) {
      const from = resolve(mediaDir, file)
      if (!existsSync(from)) continue
      mkdirSync(resolve(root, dir), { recursive: true })
      copyFileSync(from, resolve(root, dir, file))
      copied++
    }
  }
  return copied
}

/**
 * Check, place media, write. Returns the summary lines; prints nothing.
 * @param {string} root  The template repo to write into.
 * @param {string} file
 * @param {string | undefined} mediaDir
 */
export function importInto(root, file, mediaDir) {
  const { files, media } = prepareImport(file)
  const copied = placeMedia(root, media, mediaDir)
  const dataDir = resolve(root, 'src/data')
  mkdirSync(dataDir, { recursive: true })
  for (const [name, text] of Object.entries(files)) writeFileSync(resolve(dataDir, name), text)
  return [
    `wrote ${Object.keys(files).length} modules to ${relative(root, dataDir)}/`,
    `  images         ${media.images.length}${media.videos.length ? ` (+ ${media.videos.length} video)` : ''}`,
    ...(mediaDir ? [`  media          ${copied} file(s) copied from ${mediaDir}`] : []),
  ]
}

/**
 * @param {string} cwd
 * @param {string[]} argv
 */
export async function importContent(cwd, argv) {
  const args = parseArgs('import-content', argv, { values: ['root', 'media'], positionals: 1 })
  const [input] = args._
  if (!input) throw new Error('which content file? (site-cms import-content <content.json>)')
  const root = resolve(cwd, args.root ?? '.')
  if (!existsSync(resolve(root, 'package.json'))) throw new Error(`${root} is not a template repo (no package.json)`)
  const lines = importInto(root, resolve(cwd, input), args.media === undefined ? undefined : resolve(cwd, args.media))
  console.log(lines.join('\n'))
}
