/**
 * The mapping *rules*, against verbatim captures of the hub's REST responses.
 *
 * What belongs here: that a populated media relation becomes a `RemotePhoto`, that an unset or
 * unpopulated one fails by hub field path, that a select value outside the shared vocabulary fails
 * naming the document, that Payload's bookkeeping never reaches a page, and that optional photo keys
 * are omitted rather than set to `undefined`.
 *
 * What does not: any assertion about a particular business's copy. "These fixtures deep-equal my
 * `src/data`" is a real and useful test, but it is per-template — it needs that template's data
 * modules and real `ImageMetadata` from image imports — so it stays in each template repo.
 */
import { describe, expect, it } from 'vitest';
import {
  mapFaqs,
  mapProcess,
  mapProjects,
  mapServices,
  mapSite,
  mapStats,
  mapTestimonials,
  media,
  photo,
  type HubFaqDoc,
  type HubMedia,
  type HubProcessStepDoc,
  type HubProjectDoc,
  type HubServiceDoc,
  type HubSiteDoc,
  type HubStatDoc,
  type HubTestimonialDoc,
} from '../src/cms.map.js';
import { SERVICE_ICONS } from '../src/serviceIcons.js';
import hubSite from './__fixtures__/hub-site.json' with { type: 'json' };
import hubServices from './__fixtures__/hub-services.json' with { type: 'json' };
import hubProjects from './__fixtures__/hub-projects.json' with { type: 'json' };
import hubTestimonials from './__fixtures__/hub-testimonials.json' with { type: 'json' };
import hubProcess from './__fixtures__/hub-process-steps.json' with { type: 'json' };
import hubStats from './__fixtures__/hub-stats.json' with { type: 'json' };
import hubFaqs from './__fixtures__/hub-faqs.json' with { type: 'json' };

/* Every document below is a verbatim capture of the hub's REST response for the demo tenant. */
const baseSiteDoc = hubSite.docs[0] as unknown as HubSiteDoc;
const siteDoc = (overrides: Partial<HubSiteDoc> = {}): HubSiteDoc => ({ ...baseSiteDoc, ...overrides });
const serviceDocs = hubServices.docs as unknown as HubServiceDoc[];
const projectDocs = hubProjects.docs as unknown as HubProjectDoc[];
const testimonialDocs = hubTestimonials.docs as unknown as HubTestimonialDoc[];

/** Shape of every hub-served image after mapping: absolute URL plus intrinsic size. */
const remote = {
  src: expect.stringMatching(/^https?:\/\//),
  width: expect.any(Number),
  height: expect.any(Number),
};

/** Payload bookkeeping that must never survive a mapper, at any depth. */
const BOOKKEEPING = ['id', 'tenant', 'order', 'createdAt', 'updatedAt'];
const hasBookkeeping = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasBookkeeping);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    // A mapped `RemotePhoto` is a leaf; its `src`/`width`/`height` are the whole point.
    if (keys.every((k) => ['src', 'width', 'height'].includes(k))) return false;
    return keys.some((k) => BOOKKEEPING.includes(k)) || Object.values(value).some(hasBookkeeping);
  }
  return false;
};

describe('photo / media', () => {
  it('reduces a populated media doc to src/width/height', () => {
    expect(photo('site.heroPoster', baseSiteDoc.heroPoster)).toStrictEqual({
      src: baseSiteDoc.heroPoster.url,
      width: baseSiteDoc.heroPoster.width,
      height: baseSiteDoc.heroPoster.height,
    });
  });

  it('media returns the populated doc itself, so videos (no dimensions) pass', () => {
    const video = baseSiteDoc.heroVideo as HubMedia;
    expect(media('site.heroVideo', video)).toBe(video);
    expect(video.width).toBeNull();
  });

  it('names the field and the fix for an unset, unpopulated or non-image relation', () => {
    expect(() => photo('site.heroPoster', null)).toThrow('CMS site.heroPoster: no image set — upload one in the hub');
    expect(() => media('site.heroVideo', undefined)).toThrow(
      'CMS site.heroVideo: no image set — upload one in the hub',
    );
    expect(() => photo('site.heroPoster', 157)).toThrow(
      'CMS site.heroPoster: relation not populated (got 157); fetch with depth=1',
    );
    expect(() => photo('site.heroPoster', baseSiteDoc.heroVideo as HubMedia)).toThrow(
      'CMS site.heroPoster: media has no width/height (is it an image?)',
    );
  });
});

describe('mapSite', () => {
  const s = mapSite(siteDoc());

  it('serves the hero video, poster and avatars from the hub', () => {
    expect(s.hero.video).toMatch(/^https?:\/\//);
    expect(s.hero.poster).toEqual(remote);
    expect(s.hero.avatars.length).toBe(baseSiteDoc.avatars.length);
    for (const avatar of s.hero.avatars) expect(avatar).toEqual(remote);
  });

  it('drops every Payload row id, tenant, order and timestamp', () => {
    // Every array row carries a Payload `id`; the mapper must drop it, not forward it.
    expect(baseSiteDoc.aboutCards[0]).toHaveProperty('id');
    const [first] = baseSiteDoc.aboutCards;
    expect(s.aboutCards[0]).toStrictEqual({ title: first!.title, body: first!.body });
    expect(hasBookkeeping(s)).toBe(false);
  });

  it('round-trips text fields byte for byte', () => {
    expect(s.site.name).toBe(baseSiteDoc.name);
    expect(s.aboutHeading).toBe(baseSiteDoc.aboutHeading);
    expect(s.trustCard.bullets).toStrictEqual((baseSiteDoc.trustCard.bullets ?? []).map((b) => b.text));
    expect(s.site.nav).toStrictEqual((baseSiteDoc.nav ?? []).map(({ label, href }) => ({ label, href })));
    expect(s.ctaBand).toStrictEqual(baseSiteDoc.ctaBand);
  });

  it('names the hub field path when a site media relation is missing', () => {
    expect(() => mapSite(siteDoc({ heroPoster: null as never }))).toThrow(/^CMS site\.heroPoster: no image set/);
    const avatars = baseSiteDoc.avatars.map((a, i) => (i === 2 ? { ...a, image: 7 as never } : a));
    expect(() => mapSite(siteDoc({ avatars }))).toThrow(/^CMS site\.avatars\[2\]\.image: relation not populated/);
    const ctaStrip = (baseSiteDoc.ctaStrip ?? []).map((c, i) => (i === 3 ? { ...c, image: null as never } : c));
    expect(() => mapSite(siteDoc({ ctaStrip }))).toThrow(/^CMS site\.ctaStrip\[3\]\.image: no image set/);
  });

  it('omits hero.video entirely when the tenant uploaded none', () => {
    // The poster carries the hero on its own, so a niche with no stock footage can still onboard.
    // The key must be ABSENT, not undefined: each template asserts its fixtures deep-equal its own
    // `src/data`, where a template with no video simply has no `video` key.
    for (const empty of [null, undefined]) {
      const hero = mapSite(siteDoc({ heroVideo: empty })).hero;
      expect('video' in hero).toBe(false);
      expect(hero.poster).toBeDefined();
    }
    expect(mapSite(siteDoc({})).hero.video).toBe((baseSiteDoc.heroVideo as HubMedia).url);
  });

  it('names the document and the allowed values for an unknown select', () => {
    const socials = (baseSiteDoc.socials ?? []).map((s, i) => (i === 1 ? { ...s, label: 'myspace' } : s));
    expect(() => mapSite(siteDoc({ socials }))).toThrow(
      'CMS site.socials[1].label: unexpected value "myspace" (allowed: x, linkedin, facebook, instagram)',
    );
  });

  it('keeps the CTA strip in hub order, with remote images', () => {
    const strip = baseSiteDoc.ctaStrip ?? [];
    expect(s.ctaStrip.map((c) => c.alt)).toStrictEqual(strip.map((c) => c.alt));
    for (const c of s.ctaStrip) expect(c.image).toEqual(remote);
  });
});

describe('list mappers', () => {
  it('maps services in order, images becoming remote and bullets flattening', () => {
    const out = mapServices(serviceDocs);
    expect(out.map((x) => x.title)).toStrictEqual(serviceDocs.map((d) => d.title));
    for (const [i, svc] of out.entries()) {
      expect(svc.image).toEqual(remote);
      expect(svc.bullets).toStrictEqual((serviceDocs[i]!.bullets ?? []).map((b) => b.text));
      expect(Object.keys(svc).sort()).toStrictEqual(['blurb', 'bullets', 'icon', 'image', 'imageAlt', 'title']);
    }
    expect(hasBookkeeping(out)).toBe(false);
  });

  it('maps the gallery, keeping alt and emphasis and nothing else', () => {
    const out = mapProjects(projectDocs);
    expect(out.map((g) => g.alt)).toStrictEqual(projectDocs.map((d) => d.alt));
    expect(out.map((g) => g.emphasis)).toStrictEqual(projectDocs.map((d) => d.emphasis));
    for (const g of out) expect(g.image).toEqual(remote);
    expect(hasBookkeeping(out)).toBe(false);
  });

  it('maps testimonials with both photos remote', () => {
    const out = mapTestimonials(testimonialDocs);
    expect(out.map((t) => t.quote)).toStrictEqual(testimonialDocs.map((d) => d.quote));
    for (const t of out) {
      expect(t.image).toEqual(remote);
      expect(t.beforeImage).toEqual(remote);
      expect(Object.keys(t).sort()).toStrictEqual(['alt', 'author', 'beforeImage', 'image', 'quote']);
    }
  });

  it('omits the photo keys a story leaves unset rather than mapping them to undefined', () => {
    const [both] = testimonialDocs;
    const [photoOnly] = mapTestimonials([{ ...both!, beforeImage: null }]);
    expect(Object.keys(photoOnly!)).toStrictEqual(['quote', 'author', 'image', 'alt']);
    const [quoteOnly] = mapTestimonials([{ ...both!, image: null, beforeImage: null }]);
    expect(Object.keys(quoteOnly!)).toStrictEqual(['quote', 'author', 'alt']);
  });

  it('maps the text-only collections to exactly their two fields', () => {
    const process = hubProcess.docs as unknown as HubProcessStepDoc[];
    const stats = hubStats.docs as unknown as HubStatDoc[];
    const faqs = hubFaqs.docs as unknown as HubFaqDoc[];
    expect(mapProcess(process)).toStrictEqual(process.map(({ title, body }) => ({ title, body })));
    expect(mapStats(stats)).toStrictEqual(stats.map(({ value, label }) => ({ value, label })));
    expect(mapFaqs(faqs)).toStrictEqual(faqs.map(({ question, answer }) => ({ question, answer })));
    for (const out of [mapProcess(process), mapStats(stats), mapFaqs(faqs)]) expect(hasBookkeeping(out)).toBe(false);
  });

  it('refuses a select value outside the shared vocabulary, naming the document', () => {
    const [first, second] = serviceDocs;
    expect(() => mapServices([first!, { ...second!, icon: 'shovel' }])).toThrow(
      `CMS services[1] ${JSON.stringify(second!.title)}.icon: unexpected value "shovel"` +
        ` (allowed: ${SERVICE_ICONS.join(', ')})`,
    );
    expect(() => mapProjects([{ ...projectDocs[0]!, emphasis: 'huge' }])).toThrow(
      'CMS projects[0].emphasis: unexpected value "huge" (allowed: featured, standard)',
    );
  });

  it('names the document when a list media relation is missing', () => {
    const [first, second] = serviceDocs;
    expect(() => mapServices([first!, { ...second!, image: null as never }])).toThrow(
      `CMS services[1] ${JSON.stringify(second!.title)}.image: no image set — upload one in the hub`,
    );
    const [t] = testimonialDocs;
    expect(() => mapTestimonials([{ ...t!, beforeImage: 3 }])).toThrow(
      'CMS testimonials[0].beforeImage: relation not populated (got 3); fetch with depth=1',
    );
    const projects = projectDocs.map((p, i) => (i === 4 ? { ...p, image: null as never } : p));
    expect(() => mapProjects(projects)).toThrow('CMS projects[4].image: no image set — upload one in the hub');
  });
});

describe('v0.6 optional fields', () => {
  /** The business groups as Payload would serve them: rows for lists, `null` for every unset leaf. */
  const hubBusiness = {
    trade: 'hvac',
    town: 'Westerville',
    serviceAreaTowns: [{ id: 'r1', text: 'Westerville' }, { id: 'r2', text: 'Dublin' }],
    address: { street: '1 Main St', locality: 'Westerville', region: 'OH', postalCode: '43081', country: 'US' },
    geo: { lat: 40.1, lng: -82.9 },
    openingHours: [{ id: 'h1', dayOfWeek: ['Monday', 'Friday'], opens: '07:00', closes: '18:00' }],
    phone: { e164: '+16145550123', display: null },
    email: 'hello@acme.example',
    siteUrl: 'https://acme.example',
    gbp: { url: null, placeId: null },
    reviews: { count: 212, rating: 4.9 },
  };
  const hubCopy = { businessName: 'Acme', town: 'Westerville', primaryService: 'AC repair', differentiator: '24-7', tenure: null };

  it('maps nothing new for a v0.5 tenant, including the groups Payload sends all-null', () => {
    const out = mapSite(
      siteDoc({
        business: { trade: null, town: null, gbp: { url: null, placeId: null } },
        copy: { businessName: null, tenure: null },
        flags: { reviewsFromGbp: null, isPreview: null },
      }),
    );
    expect(Object.keys(out.site)).not.toContain('business');
    expect(Object.keys(out.site)).not.toContain('copy');
    expect(Object.keys(out.site)).not.toContain('flags');
    expect(out).toStrictEqual(mapSite(baseSiteDoc));
  });

  it('maps the business, copy and flags groups, dropping row ids and unset optionals', () => {
    const { site } = mapSite(siteDoc({ business: hubBusiness, copy: hubCopy, flags: { reviewsFromGbp: true, isPreview: false } }));
    expect(site.business).toStrictEqual({
      trade: 'hvac',
      town: 'Westerville',
      serviceAreaTowns: ['Westerville', 'Dublin'],
      address: { street: '1 Main St', locality: 'Westerville', region: 'OH', postalCode: '43081', country: 'US' },
      geo: { lat: 40.1, lng: -82.9 },
      openingHours: [{ dayOfWeek: ['Monday', 'Friday'], opens: '07:00', closes: '18:00' }],
      phone: { e164: '+16145550123' },
      email: 'hello@acme.example',
      siteUrl: 'https://acme.example',
      reviews: { count: 212, rating: 4.9 },
    });
    // `null` tenure is a value ("not said"), kept as such.
    expect(site.copy).toStrictEqual({ ...hubCopy, differentiator: '24-7', tenure: null });
    expect(site.flags).toStrictEqual({ reviewsFromGbp: true, isPreview: false });
  });

  it('refuses a trade, day or differentiator outside the vocabulary, by field', () => {
    expect(() => mapSite(siteDoc({ business: { ...hubBusiness, trade: 'pest' } }))).toThrow(
      /^CMS site\.business\.trade: unexpected value "pest" \(allowed: hvac, plumbing, pest-control, /,
    );
    expect(() =>
      mapSite(siteDoc({ business: { ...hubBusiness, openingHours: [{ dayOfWeek: ['Mon'], opens: '07:00', closes: '18:00' }] } })),
    ).toThrow('CMS site.business.openingHours[0].dayOfWeek[0]: unexpected value "Mon"');
    expect(() => mapSite(siteDoc({ copy: { ...hubCopy, differentiator: 'cheap' } }))).toThrow(
      'CMS site.copy.differentiator: unexpected value "cheap"',
    );
  });

  it('maps priceHint and the testimonial rating, date and source only when set', () => {
    const [service] = mapServices([{ ...serviceDocs[0]!, priceHint: 'From $89' }]);
    expect(service!.priceHint).toBe('From $89');
    expect('priceHint' in mapServices([{ ...serviceDocs[0]!, priceHint: null }])[0]!).toBe(false);

    const [t] = mapTestimonials([
      { ...testimonialDocs[0]!, rating: 5, date: '2026-03-14T00:00:00.000Z', source: 'google' },
    ]);
    expect(t).toMatchObject({ rating: 5, date: '2026-03-14', source: 'google' });
    // A Payload select stores the rating as a string; it maps to the number.
    expect(mapTestimonials([{ ...testimonialDocs[0]!, rating: '4' }])[0]!.rating).toBe(4);
    const [unset] = mapTestimonials([{ ...testimonialDocs[0]!, rating: null, date: null, source: null }]);
    expect(Object.keys(unset!)).toStrictEqual(['quote', 'author', 'image', 'beforeImage', 'alt']);
    expect(() => mapTestimonials([{ ...testimonialDocs[0]!, rating: 7 }])).toThrow(
      'CMS testimonials[0].rating: unexpected value 7 (allowed: 1, 2, 3, 4, 5)',
    );
  });
});
