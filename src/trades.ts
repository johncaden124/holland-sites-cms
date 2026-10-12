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

/** How a trade reads on the page and in structured data (v0.8). */
export interface TradeInfo {
  /** The trade mid-sentence and in titles: "Landscaping in Westerville", "HVAC Services". */
  noun: string;
  /**
   * The schema.org `LocalBusiness` subtype a site's JSON-LD declares. Only types that exist in the
   * schema.org vocabulary: where it has no subtype for a trade (landscaping, pest control, cleaning
   * and most others), that is `HomeAndConstructionBusiness`, never an invented `LandscapingBusiness`.
   */
  schemaType: string;
}

/**
 * Per-trade display noun and schema.org type, one entry per `TRADES` value (a test enforces it).
 * Shared so every template and the generator publish the same type for the same trade.
 */
export const TRADE_INFO: Readonly<Record<Trade, TradeInfo>> = {
  hvac: { noun: 'HVAC', schemaType: 'HVACBusiness' },
  plumbing: { noun: 'Plumbing', schemaType: 'Plumber' },
  'pest-control': { noun: 'Pest Control', schemaType: 'HomeAndConstructionBusiness' },
  electrical: { noun: 'Electrical', schemaType: 'Electrician' },
  'garage-door': { noun: 'Garage Door Repair', schemaType: 'HomeAndConstructionBusiness' },
  'appliance-repair': { noun: 'Appliance Repair', schemaType: 'HomeAndConstructionBusiness' },
  restoration: { noun: 'Restoration', schemaType: 'HomeAndConstructionBusiness' },
  cleaning: { noun: 'Cleaning', schemaType: 'HomeAndConstructionBusiness' },
  landscaping: { noun: 'Landscaping', schemaType: 'HomeAndConstructionBusiness' },
  'tree-service': { noun: 'Tree Service', schemaType: 'HomeAndConstructionBusiness' },
  'junk-removal': { noun: 'Junk Removal', schemaType: 'HomeAndConstructionBusiness' },
  roofing: { noun: 'Roofing', schemaType: 'RoofingContractor' },
  painting: { noun: 'Painting', schemaType: 'HousePainter' },
  'fence-deck': { noun: 'Fence & Deck', schemaType: 'GeneralContractor' },
  'auto-repair': { noun: 'Auto Repair', schemaType: 'AutoRepair' },
  'pool-service': { noun: 'Pool Service', schemaType: 'HomeAndConstructionBusiness' },
  handyman: { noun: 'Handyman', schemaType: 'HomeAndConstructionBusiness' },
  gutters: { noun: 'Gutter Services', schemaType: 'HomeAndConstructionBusiness' },
  'pressure-washing': { noun: 'Pressure Washing', schemaType: 'HomeAndConstructionBusiness' },
  other: { noun: 'Home Services', schemaType: 'LocalBusiness' },
};
