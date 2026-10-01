/**
 * The content file: one JSON document shaped like the hub's Payload collections, which is how a
 * site's content travels between repos.
 *
 *   template `src/data/*.ts`  --export-content-->  content.json  --seed:tenant-->  hub
 *                             <--import-content--
 *
 * `site-cms export-content` writes it from a template's data modules, the hub's `seed:tenant` reads
 * it, and `site-cms import-content` / `new-site` write data modules back from it — which is what the
 * generator calls to fill a fresh template fork. The two projections live here, as pure functions,
 * so they are tested against each other rather than only through the CLI; the `bin/` scripts keep
 * the file system and Vite.
 *
 * In a content file every image is a **basename** (`work-1.jpg`): the file travels with a `media/`
 * folder holding those files, and the hub stores each as an upload. List items carry no `order`: the
 * seed assigns 1..n from array position.
 *
 * Astro-free and dependency-free; published on the `./content-file` subpath.
 */
import type {
  AboutCard,
  Faq,
  GalleryImage,
  HeroMedia,
  Intro,
  LocalContent,
  ProcessStep,
  Service,
  ShortIntro,
  SiteContent,
  SiteSettings,
  Stat,
  Testimonial,
} from './types.js';

// ---- the data modules ------------------------------------------------------------------------

/**
 * The `src/data` module contract: which file exports which names. The exporter loads exactly these,
 * the importer writes exactly these, and a template's `cms.local.ts` assembles them.
 */
export const CONTENT_MODULES = {
  site: ['site'],
  hero: ['hero'],
  about: ['aboutHeading', 'trustCard', 'aboutCards'],
  cta: ['ctaBand'],
  services: ['servicesIntro', 'services'],
  gallery: ['workIntro', 'featuredProject', 'gallery', 'ctaStrip'],
  testimonials: ['testimonialsIntro', 'testimonials'],
  process: ['processIntro', 'processSteps'],
  stats: ['impactIntro', 'stats'],
  faqs: ['faqIntro', 'faqSideCard', 'faqs'],
} as const;

export type ContentModuleName = keyof typeof CONTENT_MODULES;

/**
 * An image in the data modules, as the exporter sees it: the Vite plugin in `bin/export-content.mjs`
 * reduces every image import to its basename with zero dimensions, and `fromContentFile` produces
 * the same shape. `width` is the marker the verifier keys on — keep it.
 */
export interface ImageRef {
  src: string;
  width: number;
  height: number;
  format?: string;
}

/** The data modules, by module name then export name, with images as `ImageRef`s. */
export interface DataModules {
  site: { site: SiteSettings };
  hero: { hero: Omit<HeroMedia, 'poster' | 'avatars'> & { poster: ImageRef; avatars: ImageRef[] } };
  about: { aboutHeading: string; trustCard: SiteContent['trustCard']; aboutCards: AboutCard[] };
  cta: { ctaBand: SiteContent['ctaBand'] };
  services: { servicesIntro: Intro; services: (Omit<Service, 'image'> & { image: ImageRef })[] };
  gallery: {
    workIntro: Intro;
    featuredProject: SiteContent['featuredProject'];
    gallery: (Omit<GalleryImage, 'image'> & { image: ImageRef })[];
    ctaStrip: { image: ImageRef; alt: string }[];
  };
  testimonials: {
    testimonialsIntro: ShortIntro;
    testimonials: (Omit<Testimonial, 'image' | 'beforeImage'> & { image?: ImageRef; beforeImage?: ImageRef })[];
  };
  process: { processIntro: Intro; processSteps: ProcessStep[] };
  stats: { impactIntro: ShortIntro; stats: Stat[] };
  faqs: { faqIntro: Intro; faqSideCard: SiteContent['faqSideCard']; faqs: Faq[] };
}

// ---- the content file ------------------------------------------------------------------------

type TextRow = { text: string };

/** `content.json`. `site` is the hub's `site` document; the rest are its six list collections. */
export interface ContentFile {
  site: Record<string, unknown> & {
    name: string;
    heroVideo?: string;
    heroPoster: string;
    avatars: { image: string }[];
    trustCard: Omit<SiteContent['trustCard'], 'bullets'> & { bullets: TextRow[] };
    ctaStrip: { image: string; alt: string }[];
  };
  services: (Omit<Service, 'image' | 'bullets'> & { image: string; bullets: TextRow[] })[];
  projects: (Omit<GalleryImage, 'image'> & { image: string })[];
  testimonials: (Omit<Testimonial, 'image' | 'beforeImage'> & { image?: string; beforeImage?: string })[];
  processSteps: ProcessStep[];
  stats: Stat[];
  faqs: Faq[];
}

/** The content file's top-level keys: the hub's collection slugs, camelCased (`processSteps`). */
export const CONTENT_FILE_KEYS = ['site', 'services', 'projects', 'testimonials', 'processSteps', 'stats', 'faqs'] as const;
const LISTS = CONTENT_FILE_KEYS.filter((k) => k !== 'site');

/** `/hero.mp4`, `hero.mp4` or `/videos/hero.mp4` → `hero.mp4`. */
const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const img = (m: ImageRef) => m.src;
const texts = (list: string[]) => list.map((text) => ({ text }));
const untexts = (rows: TextRow[]) => rows.map((r) => r.text);
/** Image placeholder for a basename: what the exporter's Vite plugin would have produced. */
const ref = (file: string): ImageRef => ({ src: file, width: 0, height: 0 });

/** Data modules → content file. The exporter's projection, unchanged in shape since v0.5. */
export function toContentFile(data: DataModules): ContentFile {
  const s = data.site.site;
  const h = data.hero.hero;
  return {
    site: {
      // Brand
      name: s.name,
      tagline: s.tagline,
      description: s.description,
      heroHeadline: s.heroHeadline,
      // Optional throughout: a key the template never set must stay absent, or the hub would store
      // an empty string and the mapper would hand it back as content nobody wrote.
      ...(s.heroEyebrow ? { heroEyebrow: s.heroEyebrow } : {}),
      ...(s.licenseNumber ? { licenseNumber: s.licenseNumber } : {}),
      nav: s.nav,
      navCta: s.navCta,
      heroCta: s.heroCta,
      labels: s.labels,
      socials: s.socials,
      footer: s.footer,
      copyright: s.copyright,
      // Hero. The poster and avatars are image imports and the video is a `public/` path, so all
      // three come from `src/data/hero.ts`.
      heroPhone: s.heroPhone,
      ...(h.video ? { heroVideo: basename(h.video) } : {}),
      heroPoster: img(h.poster),
      avatars: h.avatars.map((a) => ({ image: img(a) })),
      review: s.review,
      heroBadge: s.heroBadge,
      // About
      aboutHeading: data.about.aboutHeading,
      trustCard: { ...data.about.trustCard, bullets: texts(data.about.trustCard.bullets) },
      aboutCards: data.about.aboutCards,
      // Sections
      servicesIntro: data.services.servicesIntro,
      workIntro: data.gallery.workIntro,
      featuredProject: data.gallery.featuredProject,
      testimonialsIntro: data.testimonials.testimonialsIntro,
      impactIntro: data.stats.impactIntro,
      processIntro: data.process.processIntro,
      faqIntro: data.faqs.faqIntro,
      faqSideCard: data.faqs.faqSideCard,
      ctaBand: data.cta.ctaBand,
      ctaStrip: data.gallery.ctaStrip.map((c) => ({ image: img(c.image), alt: c.alt })),
      // Business facts and generator inputs (v0.6), only when the template has them.
      // `serviceAreaTowns` travels as `{ text }` rows, like `bullets`: the hub stores a string list
      // as an array field, and the seed writes this object as-is.
      ...(s.business ? { business: { ...s.business, serviceAreaTowns: texts(s.business.serviceAreaTowns) } } : {}),
      ...(s.copy ? { copy: s.copy } : {}),
      ...(s.flags ? { flags: s.flags } : {}),
    },
    services: data.services.services.map((x) => ({ ...x, image: img(x.image), bullets: texts(x.bullets) })),
    projects: data.gallery.gallery.map((g) => ({ image: img(g.image), alt: g.alt, emphasis: g.emphasis })),
    // `image` / `beforeImage` are optional: a niche with no before/after photography omits them, and
    // an omitted key must not survive as an ImageMetadata stub.
    // Rebuilt key by key so the JSON keeps the source's key order.
    testimonials: data.testimonials.testimonials.map((t) => {
      const doc: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(t)) {
        if (key !== 'image' && key !== 'beforeImage') doc[key] = value;
        else if (value) doc[key] = img(value as ImageRef);
      }
      return doc as ContentFile['testimonials'][number];
    }),
    processSteps: data.process.processSteps,
    stats: data.stats.stats,
    faqs: data.faqs.faqs,
  };
}

/**
 * Content file → data modules: the inverse of `toContentFile`. Images come back as `ImageRef`s
 * (basename, zero size) and the hero video as a `public/` path, which is exactly what the exporter
 * reads out of a template — so `toContentFile(fromContentFile(file))` is `file`.
 *
 * Structure is not checked here; call `contentFileProblems` first.
 */
export function fromContentFile(file: ContentFile): DataModules {
  const s = file.site as ContentFile['site'] & SiteSettings;
  const site: SiteSettings = {
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    heroHeadline: s.heroHeadline,
    ...(s.heroEyebrow ? { heroEyebrow: s.heroEyebrow } : {}),
    nav: s.nav,
    navCta: s.navCta,
    heroCta: s.heroCta,
    heroPhone: s.heroPhone,
    footer: s.footer,
    review: s.review,
    heroBadge: s.heroBadge,
    ...(s.licenseNumber ? { licenseNumber: s.licenseNumber } : {}),
    labels: s.labels,
    socials: s.socials,
    copyright: s.copyright,
    ...(s.business
      ? { business: { ...s.business, serviceAreaTowns: untexts(s.business.serviceAreaTowns as unknown as TextRow[]) } }
      : {}),
    ...(s.copy ? { copy: s.copy } : {}),
    ...(s.flags ? { flags: s.flags } : {}),
  };
  const f = file.site as Record<string, unknown> as {
    aboutHeading: string;
    aboutCards: AboutCard[];
    servicesIntro: Intro;
    workIntro: Intro;
    featuredProject: SiteContent['featuredProject'];
    testimonialsIntro: ShortIntro;
    impactIntro: ShortIntro;
    processIntro: Intro;
    faqIntro: Intro;
    faqSideCard: SiteContent['faqSideCard'];
    ctaBand: SiteContent['ctaBand'];
  };
  return {
    site: { site },
    hero: {
      hero: {
        ...(s.heroVideo ? { video: `/${s.heroVideo}` } : {}),
        poster: ref(s.heroPoster),
        avatars: s.avatars.map((a) => ref(a.image)),
      },
    },
    about: {
      aboutHeading: f.aboutHeading,
      trustCard: { ...s.trustCard, bullets: untexts(s.trustCard.bullets) },
      aboutCards: f.aboutCards,
    },
    cta: { ctaBand: f.ctaBand },
    services: {
      servicesIntro: f.servicesIntro,
      services: file.services.map((x) => ({ ...x, bullets: untexts(x.bullets), image: ref(x.image) })),
    },
    gallery: {
      workIntro: f.workIntro,
      featuredProject: f.featuredProject,
      gallery: file.projects.map((g) => ({ image: ref(g.image), alt: g.alt, emphasis: g.emphasis })),
      ctaStrip: s.ctaStrip.map((c) => ({ image: ref(c.image), alt: c.alt })),
    },
    testimonials: {
      testimonialsIntro: f.testimonialsIntro,
      testimonials: file.testimonials.map((t) => {
        const doc: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(t)) {
          if (key !== 'image' && key !== 'beforeImage') doc[key] = value;
          else if (value) doc[key] = ref(value as string);
        }
        return doc as DataModules['testimonials']['testimonials'][number];
      }),
    },
    process: { processIntro: f.processIntro, processSteps: file.processSteps },
    stats: { impactIntro: f.impactIntro, stats: file.stats },
    faqs: { faqIntro: f.faqIntro, faqSideCard: f.faqSideCard, faqs: file.faqs },
  };
}

/** Data modules → the `LocalContent` a template's `cms.local.ts` assembles, for validation. */
export function toLocalContent(data: DataModules): LocalContent {
  return {
    site: {
      site: data.site.site,
      hero: data.hero.hero as HeroMedia,
      aboutHeading: data.about.aboutHeading,
      trustCard: data.about.trustCard,
      aboutCards: data.about.aboutCards,
      servicesIntro: data.services.servicesIntro,
      workIntro: data.gallery.workIntro,
      featuredProject: data.gallery.featuredProject,
      testimonialsIntro: data.testimonials.testimonialsIntro,
      impactIntro: data.stats.impactIntro,
      processIntro: data.process.processIntro,
      faqIntro: data.faqs.faqIntro,
      faqSideCard: data.faqs.faqSideCard,
      ctaBand: data.cta.ctaBand,
      ctaStrip: data.gallery.ctaStrip as SiteContent['ctaStrip'],
    },
    services: data.services.services as Service[],
    projects: data.gallery.gallery as GalleryImage[],
    testimonials: data.testimonials.testimonials as Testimonial[],
    process: data.process.processSteps,
    stats: data.stats.stats,
    faqs: data.faqs.faqs,
  };
}

// ---- checks ----------------------------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The structural rules the hub's `seed:tenant` applies to a content file (`src/seed/client.ts`
 * there), so a file that passes here is one the seed accepts: exactly the seven top-level keys,
 * `site` an object, every list a non-empty array of objects (a client build fails on an empty
 * collection), and no list item carrying `order`. Field-level rules are `validateSiteContent`'s job.
 */
export function contentFileProblems(raw: unknown): string[] {
  if (!isObject(raw)) return ['the content file must be a JSON object'];
  const problems: string[] = [];
  for (const key of CONTENT_FILE_KEYS) if (raw[key] === undefined) problems.push(`missing "${key}"`);
  for (const key of Object.keys(raw)) {
    if (!(CONTENT_FILE_KEYS as readonly string[]).includes(key)) problems.push(`unknown key "${key}" — the hub has no such collection`);
  }
  if (raw.site !== undefined && !isObject(raw.site)) problems.push('"site" must be an object');
  for (const key of LISTS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) || !value.every(isObject)) problems.push(`"${key}" must be an array of objects`);
    else if (value.length === 0) problems.push(`"${key}" is empty — every collection needs at least one document`);
    else if (value.some((item) => 'order' in item)) problems.push(`"${key}": items must not carry "order"`);
  }
  return problems;
}

/** Every image basename a content file references, video included, in first-seen order. */
export function contentFileMedia(file: ContentFile): { images: string[]; videos: string[] } {
  const images = new Set<string>();
  const s = file.site;
  images.add(s.heroPoster);
  s.avatars.forEach((a) => images.add(a.image));
  s.ctaStrip.forEach((c) => images.add(c.image));
  file.services.forEach((x) => images.add(x.image));
  file.projects.forEach((g) => images.add(g.image));
  file.testimonials.forEach((t) => {
    if (t.image) images.add(t.image);
    if (t.beforeImage) images.add(t.beforeImage);
  });
  return { images: [...images], videos: s.heroVideo ? [s.heroVideo] : [] };
}

// ---- rendering data modules ------------------------------------------------------------------

/** The type each export is annotated with in a generated module, from `@hollandtech/site-cms/types`. */
const EXPORT_TYPES: Record<string, { type: string; imports: string[] }> = {
  site: { type: 'SiteSettings', imports: ['SiteSettings'] },
  hero: { type: 'HeroMedia', imports: ['HeroMedia'] },
  aboutHeading: { type: 'string', imports: [] },
  trustCard: { type: "SiteContent['trustCard']", imports: ['SiteContent'] },
  aboutCards: { type: 'AboutCard[]', imports: ['AboutCard'] },
  ctaBand: { type: "SiteContent['ctaBand']", imports: ['SiteContent'] },
  servicesIntro: { type: 'Intro', imports: ['Intro'] },
  services: { type: 'Service[]', imports: ['Service'] },
  workIntro: { type: 'Intro', imports: ['Intro'] },
  featuredProject: { type: "SiteContent['featuredProject']", imports: ['SiteContent'] },
  gallery: { type: 'GalleryImage[]', imports: ['GalleryImage'] },
  ctaStrip: { type: "SiteContent['ctaStrip']", imports: ['SiteContent'] },
  testimonialsIntro: { type: 'ShortIntro', imports: ['ShortIntro'] },
  testimonials: { type: 'Testimonial[]', imports: ['Testimonial'] },
  processIntro: { type: 'Intro', imports: ['Intro'] },
  processSteps: { type: 'ProcessStep[]', imports: ['ProcessStep'] },
  impactIntro: { type: 'ShortIntro', imports: ['ShortIntro'] },
  stats: { type: 'Stat[]', imports: ['Stat'] },
  faqIntro: { type: 'Intro', imports: ['Intro'] },
  faqSideCard: { type: "SiteContent['faqSideCard']", imports: ['SiteContent'] },
  faqs: { type: 'Faq[]', imports: ['Faq'] },
};

const HEADER = `/**
 * Generated by \`site-cms import-content\` from a content file. The generator owns this format:
 * change the content file and re-import rather than editing here, or the next import overwrites it.
 */
`;

const isImageRef = (value: unknown): value is ImageRef =>
  isObject(value) && typeof value.src === 'string' && typeof value.width === 'number' && 'height' in value;

/** A TS string literal in single quotes, escaped the way JSON escapes (so `\n` stays `\n`). */
const quote = (text: string) => `'${JSON.stringify(text).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * `hero-poster.jpg` → `heroPoster`, `work-1.jpg` → `work1`, `2024.jpg` → `image2024`. Deterministic,
 * so a re-import produces the same names, which is what makes the output byte-stable.
 */
function identifierFor(file: string, taken: Set<string>): string {
  const stem = file.replace(/\.[^.]+$/, '');
  const words = stem.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let name = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join('');
  if (!name || !/^[A-Za-z_$]/.test(name)) name = `image${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  // On a collision, the extension first (`work1Jpg` beside `work1` from `work-1.png`), then a counter.
  const ext = /\.([A-Za-z0-9]+)$/.exec(file)?.[1] ?? '';
  let candidate = name;
  if (taken.has(candidate) && ext) candidate = `${name}${ext.charAt(0).toUpperCase()}${ext.slice(1).toLowerCase()}`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${name}_${n}`;
  taken.add(candidate);
  return candidate;
}

/**
 * Data modules → the source text of each `src/data/<module>.ts`, keyed by file name.
 *
 * One fixed format, owned by the generator: a header, `import type` from the package, one default
 * import per image (from `../assets/`), then each export annotated with its content type and printed
 * as a multi-line literal (two-space indent, single quotes, keys in content order). Hand-written
 * modules are free to look however they like; generated ones always look exactly like this, so
 * `renderDataModules(fromContentFile(toContentFile(fromContentFile(x))))` is byte-identical to
 * `renderDataModules(fromContentFile(x))`.
 */
export function renderDataModules(data: DataModules): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [module, exportNames] of Object.entries(CONTENT_MODULES) as [ContentModuleName, readonly string[]][]) {
    const values = data[module] as Record<string, unknown>;
    const images = new Map<string, string>(); // basename → identifier
    const taken = new Set<string>(exportNames);

    const print = (value: unknown, indent: string): string => {
      if (isImageRef(value)) {
        let id = images.get(value.src);
        if (!id) images.set(value.src, (id = identifierFor(value.src, taken)));
        return id;
      }
      if (typeof value === 'string') return quote(value);
      if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
      const inner = `${indent}  `;
      if (Array.isArray(value)) {
        if (!value.length) return '[]';
        return `[\n${value.map((v) => `${inner}${print(v, inner)},\n`).join('')}${indent}]`;
      }
      if (isObject(value)) {
        const entries = Object.entries(value).filter(([, v]) => v !== undefined);
        if (!entries.length) return '{}';
        const key = (k: string) => (IDENTIFIER.test(k) ? k : quote(k));
        return `{\n${entries.map(([k, v]) => `${inner}${key(k)}: ${print(v, inner)},\n`).join('')}${indent}}`;
      }
      throw new Error(`renderDataModules: cannot print ${typeof value} in src/data/${module}.ts`);
    };

    const body = exportNames
      .map((name) => {
        const { type } = EXPORT_TYPES[name]!;
        const annotation = type === 'string' ? '' : `: ${type}`;
        return `export const ${name}${annotation} = ${print(values[name], '')};\n`;
      })
      .join('\n');
    const typeImports = [...new Set(exportNames.flatMap((name) => EXPORT_TYPES[name]!.imports))].sort();
    const head = [
      HEADER,
      typeImports.length ? `import type { ${typeImports.join(', ')} } from '@hollandtech/site-cms/types';\n` : '',
      ...[...images].map(([file, id]) => `import ${id} from '../assets/${file}';\n`),
    ].join('');
    files[`${module}.ts`] = `${head}\n${body}`;
  }
  return files;
}
