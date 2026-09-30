/**
 * Runtime validation of content against the contract in `types.ts`.
 *
 * TypeScript checks a template's own `src/data` at compile time, but nothing checks what arrives at
 * runtime: a hub response, a `content.json` another tool wrote, a template written in plain JS. This
 * does, against `schema/site-content.schema.json` — the schema generated from `types.ts`, compiled
 * by Ajv at build time (`scripts/build-schema.mjs`) so the package still has no runtime dependencies.
 *
 * It reports **every** problem at once, each with a field path in the same notation the rest of the
 * package's errors use (`site.footer.email`, `services[2].icon`), because the operator fixing a
 * content file wants the whole list, not one error per build.
 *
 * Dependency-free and Astro-free; also published on the `./validate` subpath.
 */
import * as compiled from './generated/validators.js';

/** The definitions content can be validated against: the whole document, or one part of it. */
export type ContentDefinition =
  | 'LocalContent'
  | 'SiteContent'
  | 'SiteSettings'
  | 'Service'
  | 'GalleryImage'
  | 'Testimonial'
  | 'ProcessStep'
  | 'Stat'
  | 'Faq';

export interface ContentProblem {
  /** Where, from the root the caller named: `site.site.footer.email`, `services[2].icon`. */
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  problems: ContentProblem[];
}

export interface ValidateOptions {
  /** What `value` is. Defaults to `LocalContent`: the whole document (`site` plus the six lists). */
  root?: ContentDefinition | undefined;
  /** Prefix for every reported path, e.g. `services[2]` when validating one item of a list. */
  path?: string | undefined;
}

interface AjvError {
  instancePath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}
type CompiledValidator = ((data: unknown) => boolean) & { errors?: AjvError[] | null };

const VALIDATORS = compiled as unknown as Record<ContentDefinition, CompiledValidator>;

/** A path segment, joined the way the rest of the package names fields. */
const join = (base: string, segment: string | number): string =>
  typeof segment === 'number' || /^\d+$/.test(segment)
    ? `${base}[${segment}]`
    : base
      ? `${base}.${segment}`
      : segment;

const unescapePointer = (s: string) => s.replace(/~1/g, '/').replace(/~0/g, '~');

/** Read the value at a JSON pointer, for "got …" in a message. */
function at(value: unknown, pointer: string): unknown {
  let node = value;
  for (const raw of pointer.split('/').slice(1)) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[unescapePointer(raw)];
  }
  return node;
}

const describe = (value: unknown): string => {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

function toProblem(error: AjvError, data: unknown, prefix: string): ContentProblem {
  let path = prefix;
  for (const raw of error.instancePath.split('/').slice(1)) path = join(path, unescapePointer(raw));
  const got = () => describe(at(data, error.instancePath));
  const { params } = error;
  switch (error.keyword) {
    case 'required':
      return { path: join(path, String(params.missingProperty)), message: 'is required but missing' };
    case 'additionalProperties':
      return {
        path: join(path, String(params.additionalProperty)),
        message: 'is not a field of the content model (misspelt, or from a newer version?)',
      };
    case 'enum':
      return {
        path,
        message: `must be one of ${(params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(', ')} (got ${got()})`,
      };
    case 'type':
      return { path, message: `must be ${String(params.type).replace(',', ' or ')} (got ${got()})` };
    case 'pattern':
      return { path, message: `must match ${String(params.pattern)} (got ${got()})` };
    default:
      return { path, message: `${error.message ?? error.keyword} (got ${got()})` };
  }
}

/**
 * A copy of `value` in which every local `ImageMetadata` is replaced by a plain stub.
 *
 * In a production Astro build an imported image is a Proxy whose `get` trap copies the unoptimised
 * original into `dist/` — so a validator that *reads* `src` off one ships the original. `'format' in
 * value` goes through `has`, which the Proxy does not trap (see `photo.ts`), so the check is made
 * with `in` and the object itself is never read.
 */
function withoutLocalImages(value: unknown, depth = 0): unknown {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (!Array.isArray(value) && 'format' in value) return { src: 'local-image', width: 0, height: 0 };
  if (Array.isArray(value)) return value.map((item) => withoutLocalImages(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) out[key] = withoutLocalImages(child, depth + 1);
  return out;
}

/** Where `SiteSettings` sits under each root, for the checks a schema cannot express. */
const SETTINGS_AT: Partial<Record<ContentDefinition, string[]>> = {
  LocalContent: ['site', 'site'],
  SiteContent: ['site'],
  SiteSettings: [],
};

function semanticProblems(data: unknown, root: ContentDefinition, prefix: string): ContentProblem[] {
  const keys = SETTINGS_AT[root];
  if (!keys) return [];
  let settings = data as Record<string, unknown> | undefined;
  for (const key of keys) settings = settings?.[key] as Record<string, unknown> | undefined;
  const copy = settings?.copy as { businessName?: unknown } | undefined;
  const base = keys.reduce(join, prefix);
  if (copy && typeof copy.businessName === 'string' && typeof settings?.name === 'string') {
    if (copy.businessName !== settings.name) {
      return [
        {
          path: join(join(base, 'copy'), 'businessName'),
          message: `must equal ${join(base, 'name')} (${JSON.stringify(settings.name)}), which it aliases (got ${JSON.stringify(copy.businessName)})`,
        },
      ];
    }
  }
  return [];
}

/**
 * Validate content against the contract. Never throws on bad content: returns every problem found.
 *
 * ```ts
 * const { ok, problems } = validateSiteContent(JSON.parse(text));
 * if (!ok) throw new Error(formatProblems(problems));
 * ```
 */
export function validateSiteContent(value: unknown, options: ValidateOptions = {}): ValidationResult {
  const root = options.root ?? 'LocalContent';
  const prefix = options.path ?? '';
  const validator = VALIDATORS[root];
  if (!validator) throw new Error(`validateSiteContent: unknown root "${root}"`);
  const data = withoutLocalImages(value);
  const problems = validator(data) ? [] : (validator.errors ?? []).map((e) => toProblem(e, data, prefix));
  problems.push(...semanticProblems(data, root, prefix));
  return { ok: problems.length === 0, problems };
}

/** One line per problem, `  - path: message`, for an error message or a CLI report. */
export const formatProblems = (problems: ContentProblem[]): string =>
  problems.map((p) => `  - ${p.path || '(root)'}: ${p.message}`).join('\n');
