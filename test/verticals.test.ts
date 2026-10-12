import { describe, expect, it } from 'vitest';
import { TRADES } from '../src/trades.js';
import { VERTICAL_IDS, VERTICALS, isVertical, verticalInfo } from '../src/verticals.js';

describe('verticals', () => {
  it('are trades, each with a template', () => {
    expect(VERTICAL_IDS).toStrictEqual(['hvac', 'landscaping']);
    for (const id of VERTICAL_IDS) {
      expect(TRADES).toContain(id);
      expect(VERTICALS[id].template).toMatch(/^template-[a-z-]+$/);
    }
  });

  it('look up by slug, and refuse anything else by name', () => {
    expect(verticalInfo('hvac')).toStrictEqual({ id: 'hvac', label: 'Heating & cooling', template: 'template-hvac' });
    expect(isVertical('landscaping')).toBe(true);
    expect(isVertical('plumbing')).toBe(false);
    expect(isVertical('toString')).toBe(false);
    expect(() => verticalInfo('plumbing')).toThrow('unknown vertical "plumbing" (known: hvac, landscaping)');
  });
});
