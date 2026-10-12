/**
 * The verticals Holland Sites builds sites for: one template each (v0.9).
 *
 * A vertical is a trade that has a template. A client's hub row carries its vertical, and that one
 * value decides which template `deploy-site` builds, which intake questions the owner answers and
 * which trade copy seeds the site. The hub (its `tenants.vertical` select), the intake form and
 * `deploy-site` all read this list, so adding a vertical is one entry here plus its template repo.
 *
 * Every key is a `Trade` slug, so a vertical drops straight into `business.trade`. Which commit of a
 * template a build uses is not pinned here: that is the builder's choice (`holland-sites`), and a
 * template release should not need a release of this package.
 *
 * Dependency-free; published on the `./verticals` subpath.
 */
import type { Trade } from './trades.js';

export interface VerticalInfo {
  /** How the vertical reads to a person: the intake's business-type choice, the hub's select. */
  label: string;
  /** The template repo's name under the agency's GitHub owner. */
  template: string;
}

export const VERTICALS = {
  hvac: { label: 'Heating & cooling', template: 'template-hvac' },
  landscaping: { label: 'Lawn care & landscaping', template: 'template-landscaping' },
} as const satisfies Partial<Record<Trade, VerticalInfo>>;

export type Vertical = keyof typeof VERTICALS;

/** The vertical slugs, in the order a picker lists them. */
export const VERTICAL_IDS = Object.keys(VERTICALS) as Vertical[];

export function isVertical(value: unknown): value is Vertical {
  return typeof value === 'string' && Object.hasOwn(VERTICALS, value);
}

/** The vertical's entry, or a thrown error naming the value and the ones that exist. */
export function verticalInfo(value: string): VerticalInfo & { id: Vertical } {
  if (!isVertical(value)) {
    throw new Error(`unknown vertical "${value}" (known: ${VERTICAL_IDS.join(', ')})`);
  }
  return { id: value, ...VERTICALS[value] };
}
