/**
 * `validateSiteContent` against the contract generated from `types.ts`: every problem at once, each
 * with a field path in the package's own notation.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateSiteContent, formatProblems } from '../src/validate.js';
import type { BusinessProfile, CopyInputs, LocalContent } from '../src/types.js';
import schema from '../schema/site-content.schema.json' with { type: 'json' };
import { local } from './local.js';

/** `local` with the v0.6 groups filled in, as a generated site would carry them. */
const business: BusinessProfile = {
  trade: 'hvac',
  town: 'Westerville',
  serviceAreaTowns: ['Westerville', 'Worthington', 'Dublin'],
  address: { street: '1 Main St', locality: 'Westerville', region: 'OH', postalCode: '43081', country: 'US' },
  geo: { lat: 40.1262, lng: -82.9291 },
  openingHours: [{ dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '07:00', closes: '18:00' }],
  phone: { e164: '+16145550123', display: '(614) 555-0123' },
  email: 'hello@acme-hvac.example',
  siteUrl: 'https://acme-hvac.example',
  gbp: { url: 'https://maps.google.com/?cid=1', placeId: 'ChIJ-abc' },
  reviews: { count: 212, rating: 4.9 },
};
const copy: CopyInputs = {
  businessName: 'Local Co',
  town: 'Westerville',
  primaryService: 'AC repair',
  differentiator: '24-7',
  tenure: null,
};
const full = (): LocalContent => ({
  ...local,
  site: { ...local.site, site: { ...local.site.site, business, copy, flags: { reviewsFromGbp: true, isPreview: false } } },
  services: local.services.map((s) => ({ ...s, priceHint: 'From $89' })),
  testimonials: local.testimonials.map((t) => ({ ...t, rating: 5, date: '2026-03-14', source: 'google' })),
});

describe('validateSiteContent', () => {
  it('accepts v0.5 content, with none of the new optional groups', () => {
    expect(validateSiteContent(local)).toStrictEqual({ ok: true, problems: [] });
  });

  it('accepts content with every v0.6 field set', () => {
    expect(validateSiteContent(full())).toStrictEqual({ ok: true, problems: [] });
  });

  it('accepts tenure as a number too', () => {
    const c = full();
    c.site.site.copy!.tenure = 12;
    expect(validateSiteContent(c).ok).toBe(true);
  });

  it('reports every problem at once, each with its path', () => {
    const c = JSON.parse(JSON.stringify(full()));
    delete c.site.site.copyright;
    c.site.site.business.phone.e164 = '614-555-0123';
    c.site.site.business.trade = 'pest';
    c.site.site.business.openingHours[0].opens = '7am';
    c.services[0].icon = 'unicorn';
    c.testimonials[0].rating = 6;
    c.faqs[0].extra = true;
    const { ok, problems } = validateSiteContent(c);
    expect(ok).toBe(false);
    const paths = problems.map((p) => p.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'site.site.copyright',
        'site.site.business.phone.e164',
        'site.site.business.trade',
        'site.site.business.openingHours[0].opens',
        'services[0].icon',
        'testimonials[0].rating',
        'faqs[0].extra',
      ]),
    );
    expect(problems).toContainEqual({ path: 'site.site.copyright', message: 'is required but missing' });
    expect(problems).toContainEqual({
      path: 'site.site.business.phone.e164',
      message: 'must match ^\\+[1-9]\\d{7,14}$ (got "614-555-0123")',
    });
    expect(problems).toContainEqual({
      path: 'faqs[0].extra',
      message: 'is not a field of the content model (misspelt, or from a newer version?)',
    });
  });

  it('holds copy.businessName to the site name it aliases', () => {
    const c = full();
    c.site.site.copy!.businessName = 'Someone Else';
    expect(validateSiteContent(c).problems).toStrictEqual([
      {
        path: 'site.site.copy.businessName',
        message: 'must equal site.site.name ("Local Co"), which it aliases (got "Someone Else")',
      },
    ]);
  });

  it('validates one part of the document, prefixing its paths', () => {
    const { problems } = validateSiteContent({ question: 'Q?' }, { root: 'Faq', path: 'faqs[3]' });
    expect(problems).toStrictEqual([{ path: 'faqs[3].answer', message: 'is required but missing' }]);
  });

  it('never reads a property of local image metadata (Astro build Proxy)', () => {
    let reads = 0;
    const trap = new Proxy(
      { src: '/_astro/x.jpg', width: 1, height: 1, format: 'jpg' },
      { get: (t, k) => (reads++, Reflect.get(t, k)) },
    );
    const c = { ...local, site: { ...local.site, hero: { ...local.site.hero, poster: trap } } };
    expect(validateSiteContent(c).ok).toBe(true);
    expect(reads).toBe(0);
  });

  it('formats problems one per line', () => {
    expect(formatProblems([{ path: 'a.b', message: 'is required but missing' }, { path: '', message: 'x' }])).toBe(
      '  - a.b: is required but missing\n  - (root): x',
    );
  });
});

describe('schema/site-content.schema.json', () => {
  it('is the committed, published schema, describing LocalContent with every type a definition', () => {
    expect(schema.$ref).toBe('#/definitions/LocalContent');
    for (const name of ['SiteContent', 'SiteSettings', 'BusinessProfile', 'CopyInputs', 'Service', 'Testimonial', 'Photo']) {
      expect(Object.keys(schema.definitions)).toContain(name);
    }
  });

  it('knows nothing of Astro', () => {
    expect(readFileSync(new URL('../schema/site-content.schema.json', import.meta.url), 'utf8')).not.toMatch(
      /ImageMetadata|astro/i,
    );
  });
});
