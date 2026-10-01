/**
 * The content-file projections as pure functions. `roundtrip.test.ts` runs the same path through the
 * CLI and Vite; these pin the rules themselves.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contentFileMedia,
  contentFileProblems,
  fromContentFile,
  renderDataModules,
  toContentFile,
  toLocalContent,
  type ContentFile,
} from '../src/contentFile.js';
import { validateSiteContent } from '../src/validate.js';

/** The hub's own `clients/demo-landscaping/content.json`. */
const fixture = (): ContentFile =>
  JSON.parse(readFileSync(new URL('./__fixtures__/content.json', import.meta.url), 'utf8')) as ContentFile;

describe('toContentFile / fromContentFile', () => {
  it('are inverses on the hub demo content, key order included', () => {
    const file = fixture();
    expect(JSON.stringify(toContentFile(fromContentFile(file)))).toBe(JSON.stringify(file));
  });

  it('carry the v0.6 business, copy and flags groups and the new list fields through', () => {
    const file = fixture();
    file.site.business = { trade: 'landscaping', town: 'Denver', serviceAreaTowns: [{ text: 'Denver' }, { text: 'Aurora' }] };
    file.site.copy = { businessName: 'LeapFly', town: 'Denver', primaryService: 'Lawn care', differentiator: 'none', tenure: null };
    file.site.flags = { isPreview: true };
    file.services[0]!.priceHint = 'From $49';
    Object.assign(file.testimonials[0]!, { rating: 5, date: '2026-01-02', source: 'google' });
    const back = toContentFile(fromContentFile(file));
    expect(back.site.business).toStrictEqual(file.site.business);
    // In the data modules the towns are a plain list, as in `BusinessProfile`.
    expect(fromContentFile(file).site.site.business?.serviceAreaTowns).toStrictEqual(['Denver', 'Aurora']);
    expect(back.site.copy).toStrictEqual(file.site.copy);
    expect(back.site.flags).toStrictEqual({ isPreview: true });
    expect(back.services[0]!.priceHint).toBe('From $49');
    expect(back.testimonials[0]).toMatchObject({ rating: 5, date: '2026-01-02', source: 'google' });
  });

  it('carry the v0.8 legal text and label groups through, and leave them out when unset', () => {
    const file = fixture();
    expect('legal' in toContentFile(fromContentFile(file)).site).toBe(false);
    file.site.legal = { callRecordingNotice: 'Calls may be recorded.' };
    const pages = { home: 'Home', services: 'Services', contact: 'Contact', privacy: 'Privacy', terms: 'Terms' };
    file.site.labels = { ...(file.site.labels as Record<string, unknown>), pages };
    const back = toContentFile(fromContentFile(file));
    expect(back.site.legal).toStrictEqual({ callRecordingNotice: 'Calls may be recorded.' });
    expect((back.site.labels as { pages?: unknown }).pages).toStrictEqual(pages);
  });

  it('turns images into basename refs and the hero video into a public/ path', () => {
    const data = fromContentFile(fixture());
    expect(data.hero.hero.video).toBe('/hero.mp4');
    expect(data.hero.hero.poster).toStrictEqual({ src: 'hero-poster.jpg', width: 0, height: 0 });
    expect(data.services.services[0]!.bullets.every((b) => typeof b === 'string')).toBe(true);
  });

  it('assembles into content that satisfies the content model', () => {
    expect(validateSiteContent(toLocalContent(fromContentFile(fixture())))).toStrictEqual({ ok: true, problems: [] });
  });
});

describe('contentFileProblems (the hub seed:tenant rules)', () => {
  it('accepts the hub demo file', () => {
    expect(contentFileProblems(fixture())).toStrictEqual([]);
  });

  it('lists every structural problem', () => {
    const { stats: _s, ...file } = fixture();
    expect(
      contentFileProblems({ ...file, faqs: [], projects: [{ order: 1 }], services: 'x', extra: {} }),
    ).toStrictEqual([
      'missing "stats"',
      'unknown key "extra" — the hub has no such collection',
      '"services" must be an array of objects',
      '"projects": items must not carry "order"',
      '"faqs" is empty — every collection needs at least one document',
    ]);
    expect(contentFileProblems([])).toStrictEqual(['the content file must be a JSON object']);
  });
});

describe('contentFileMedia', () => {
  it('lists each referenced file once, the video separately', () => {
    const { images, videos } = contentFileMedia(fixture());
    expect(videos).toStrictEqual(['hero.mp4']);
    expect(images).toHaveLength(22);
    expect(new Set(images).size).toBe(images.length);
  });
});

describe('renderDataModules', () => {
  it('is deterministic', () => {
    const data = fromContentFile(fixture());
    expect(renderDataModules(data)).toStrictEqual(renderDataModules(fromContentFile(fixture())));
  });

  it('names images from their basenames, never colliding with each other or an export', () => {
    const file = fixture();
    file.projects[0]!.image = 'gallery.jpg'; // `gallery` is an export of gallery.ts
    file.projects[1]!.image = 'work-1.png'; // same stem as work-1.jpg
    file.projects[2]!.image = '2024-deck.jpg'; // starts with a digit
    const gallery = renderDataModules(fromContentFile(file))['gallery.ts']!;
    expect(gallery).toContain("import galleryJpg from '../assets/gallery.jpg';");
    expect(gallery).toContain("import work1 from '../assets/work-1.png';");
    expect(gallery).toContain("import work1Jpg from '../assets/work-1.jpg';");
    expect(gallery).toContain("import image2024Deck from '../assets/2024-deck.jpg';");
  });

  it('escapes strings so the source text parses back to the same value', () => {
    const file = fixture();
    file.site.heroHeadline = "It's \\ a \"two\"\nline headline";
    const site = renderDataModules(fromContentFile(file))['site.ts']!;
    expect(site).toContain("heroHeadline: 'It\\'s \\\\ a \"two\"\\nline headline',");
  });
});
