// @ts-check
/**
 * What counts as a change to the public contract, for `check-version-bump.mjs`.
 *
 * The contract files (`etc/*.api.md`, `schema/*.json`) also carry documentation: API Extractor
 * copies every doc comment into its report, and the schema generator turns each one into a
 * `description`. Rewording a comment changes those files — and must still be committed, which
 * `api:check` / `check:schema` enforce — but it changes nothing a consumer compiles or validates
 * against, so it must not demand a version bump. Each file is therefore compared *normalised*:
 *
 * - an API report without its comment lines (`// …`, `/** … *\/`, ` * …`);
 * - a schema without any `description` key.
 *
 * Whatever differs after that is a real contract change.
 */

/**
 * An API Extractor report with documentation removed: comment lines, and the blank lines they
 * leave, so a doc comment added or removed is invisible.
 * @param {string} text
 */
export function normaliseApiReport(text) {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return t !== '' && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*')
    })
    .join('\n')
}

/**
 * A JSON Schema with every `description` removed, re-serialised with stable formatting.
 * @param {string} text
 */
export function normaliseSchema(text) {
  /** @param {unknown} node @returns {unknown} */
  const strip = (node) => {
    if (Array.isArray(node)) return node.map(strip)
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node)
          .filter(([key]) => key !== 'description')
          .map(([key, value]) => [key, strip(value)]),
      )
    }
    return node
  }
  return JSON.stringify(strip(JSON.parse(text)), null, 2)
}

/** @param {string} path @param {string} text */
export const normalise = (path, text) =>
  path.endsWith('.json') ? normaliseSchema(text) : path.endsWith('.md') ? normaliseApiReport(text) : text

/**
 * Compare two versions of the contract, each a map of path → file text (a path missing on one side
 * is an added or removed file).
 *
 * @param {Record<string, string>} base
 * @param {Record<string, string>} head
 * @returns {{ changed: string[], docOnly: string[], removesOrAlters: boolean }}
 *   `changed`: files whose normalised content differs; `docOnly`: files that differ only in
 *   documentation; `removesOrAlters`: whether any normalised line of the base is gone from the
 *   head (a removed or rewritten declaration), as opposed to purely added lines.
 */
export function compareContract(base, head) {
  /** @type {string[]} */
  const changed = []
  /** @type {string[]} */
  const docOnly = []
  let removesOrAlters = false
  for (const path of [...new Set([...Object.keys(base), ...Object.keys(head)])].sort()) {
    const before = base[path]
    const after = head[path]
    if (before === after) continue
    const a = before === undefined ? '' : normalise(path, before)
    const b = after === undefined ? '' : normalise(path, after)
    if (a === b) {
      docOnly.push(path)
      continue
    }
    changed.push(path)
    const kept = new Set(b.split('\n'))
    if (a.split('\n').some((line) => line !== '' && !kept.has(line))) removesOrAlters = true
  }
  return { changed, docOnly, removesOrAlters }
}
