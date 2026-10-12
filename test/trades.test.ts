/** The per-trade noun and schema.org type every template and the generator share. */
import { describe, expect, it } from 'vitest';
import { TRADE_INFO, TRADES } from '../src/trades.js';

describe('TRADE_INFO', () => {
  it('has one entry per trade, and only schema.org types a template may publish', () => {
    expect(Object.keys(TRADE_INFO)).toStrictEqual([...TRADES]);
    // The subtypes schema.org actually defines for these trades; anything else is
    // HomeAndConstructionBusiness or LocalBusiness, never an invented name like LandscapingBusiness.
    const known = new Set(['HVACBusiness', 'Plumber', 'Electrician', 'RoofingContractor', 'HousePainter', 'GeneralContractor', 'AutoRepair', 'HomeAndConstructionBusiness', 'LocalBusiness']);
    for (const [trade, info] of Object.entries(TRADE_INFO)) {
      expect(known.has(info.schemaType), `${trade}: ${info.schemaType}`).toBe(true);
      expect(info.noun.length).toBeGreaterThan(0);
    }
  });
});
