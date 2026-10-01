/**
 * The trades a client business can be — the hub's `tenants.niche` select, and `business.trade` in the
 * content model.
 *
 * The hub is the source of truth for this list (`NICHES` in its `src/collections/Tenants.ts`); it is
 * repeated here, value for value and in the same order, so a template and the generator can read it
 * without depending on the hub. Like `serviceIcons.ts` this module is dependency-free, so the hub can
 * import it back from the `./types` subpath and drop its own copy.
 *
 * Values are the hub's slugs verbatim (`pest-control`, not `pest`): a `tenant.json` written from a
 * content file carries `business.trade` straight into `niche`.
 */
export const TRADES = [
  'hvac',
  'plumbing',
  'pest-control',
  'electrical',
  'garage-door',
  'appliance-repair',
  'restoration',
  'cleaning',
  'landscaping',
  'tree-service',
  'junk-removal',
  'roofing',
  'painting',
  'fence-deck',
  'auto-repair',
  'pool-service',
  'handyman',
  'gutters',
  'pressure-washing',
  'other',
] as const;

export type Trade = (typeof TRADES)[number];
