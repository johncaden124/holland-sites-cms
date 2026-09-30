// @ts-check
/**
 * The one argument parser every `site-cms` command uses, so they all reject the same mistakes the
 * same way: an unknown option, an option missing its value, a stray positional.
 */

/**
 * @template {string} V
 * @template {string} F
 * @param {string} command  For messages.
 * @param {string[]} argv
 * @param {{ values?: readonly V[], flags?: readonly F[], positionals?: number, negatable?: readonly F[] }} spec
 *   `values` take one argument (`--out file`), `flags` take none (`--validate`), `negatable` flags
 *   also accept `--no-<flag>`, and up to `positionals` bare arguments are allowed.
 * @returns {{ [K in V]?: string } & { [K in F]?: boolean } & { _: string[] }}
 */
export function parseArgs(command, argv, { values = [], flags = [], positionals = 0, negatable = [] }) {
  /** @type {Record<string, unknown> & { _: string[] }} */
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = /** @type {string} */ (argv[i])
    if (!arg.startsWith('--')) {
      if (out._.length >= positionals) throw new Error(`unexpected argument "${arg}" (see site-cms ${command} --help)`)
      out._.push(arg)
      continue
    }
    const name = arg.slice(2)
    if ((/** @type {readonly string[]} */ (values)).includes(name)) {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      out[name] = value
    } else if ((/** @type {readonly string[]} */ (flags)).includes(name)) {
      out[name] = true
    } else if (name.startsWith('no-') && (/** @type {readonly string[]} */ (negatable)).includes(name.slice(3))) {
      out[name.slice(3)] = false
    } else {
      throw new Error(`unknown option ${arg} (see site-cms ${command} --help)`)
    }
  }
  return /** @type {any} */ (out)
}

/** `root/a/b` → `a/b`, for messages. */
export const relative = (/** @type {string} */ root, /** @type {string} */ path) =>
  path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
