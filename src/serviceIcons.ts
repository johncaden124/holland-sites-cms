/**
 * The service-icon vocabulary shared by every niche template on this content model.
 *
 * This module is deliberately dependency-free, and it lives in the shared package rather than in
 * any one template: the hub's `services.icon` select is generated from it, so a value here is a
 * contract between the CMS and every template that renders it.
 *
 * ## Naming rule
 *
 * Values name **what the glyph depicts**, never the trade that happens to use it. `water-drop`, not
 * `plumbing`; `paint-roller`, not `painter`. Two consequences follow, and both are the point:
 *
 * 1. One value serves several niches — `wrench` fits appliance repair, auto repair and handyman;
 *    `drain` fits plumbing and gutter cleaning; `spray` fits pest control, cleaning and lawn
 *    treatment. 36 values cover ~19 trades because nothing is trade-specific.
 * 2. Rewording a client's service ("Drain Cleaning" → "Clogs & Backups") never invalidates the
 *    icon, because the icon was never a description of the service — it is a picture.
 *
 * ## Groups
 *
 * The list is grouped only for human legibility (the exported array is flat); the groups are the
 * axes real home-service trades divide along, so a new niche lands inside an existing group rather
 * than needing new values:
 *
 * - **climate & air** — HVAC's four jobs: make it warmer, make it cooler, move air, clean air.
 * - **water** — everything plumbing, restoration and pool service point at: the substance, the
 *   thing that carries it, the thing that dispenses it, the thing that takes it away.
 * - **power** — electrical, split by what a homeowner actually buys: the supply, the fixture that
 *   consumes it, the light it produces.
 * - **tools & repair** — the trade-agnostic "someone comes and fixes/finishes it" set. Deliberately
 *   generic: handyman, appliance repair and garage-door service all live here.
 * - **clean & haul** — the two halves of dirt work: applying something (spray, pressure wash) and
 *   taking something away (haul, bin). Covers cleaning, pressure washing and junk removal.
 * - **structure** — the parts of a building an exterior trade replaces or covers: roofing,
 *   siding/painting, garage doors.
 * - **outdoors** — the largest group because the outdoor trades (landscaping, tree service,
 *   fencing, irrigation) subdivide the most.
 * - **vehicles** — auto repair and mobile service. One value: the vehicle itself. Engine/tire
 *   detail belongs to a dedicated automotive model, not a home-services one.
 * - **pests & protection** — pest control's targets plus the generic "we keep it out" shield, which
 *   also serves security, warranty and treatment-plan services.
 * - **trust & service** — the icons that sell the *company* rather than the work: 24/7 response,
 *   licensing, booking, and the phone number. Every niche uses at least two of these, which is why
 *   they are vocabulary rather than per-template art.
 *
 * A template implements artwork only for the values it actually needs; anything else renders that
 * template's placeholder glyph, and `Cms.warnMissingIcon` says so once per build.
 */
export const SERVICE_ICONS = [
  // climate & air
  'heating',
  'cooling',
  'air-flow',
  'air-quality',
  // water
  'water-drop',
  'pipe',
  'faucet',
  'drain',
  // power
  'power-bolt',
  'outlet',
  'lighting',
  // tools & repair
  'wrench',
  'hammer',
  'toolbox',
  'paint-roller',
  // clean & haul
  'spray',
  'pressure-wash',
  'haul-truck',
  'waste-bin',
  // structure
  'roof',
  'wall',
  'door',
  // outdoors
  'leaf',
  'tree',
  'flower',
  'sun',
  'mower',
  'fence',
  // vehicles
  'vehicle',
  // pests & protection
  'pest',
  'rodent',
  'shield',
  // trust & service
  'emergency',
  'certified',
  'schedule',
  'phone',
] as const;

/** One icon from the shared vocabulary. The hub's `services.icon` select offers exactly these. */
export type ServiceIcon = (typeof SERVICE_ICONS)[number];
