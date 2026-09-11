/**
 * Hub (Payload REST, `depth=1`) → the shared content types in `types.ts`. Every mapper lists the
 * fields it keeps, so Payload's bookkeeping (`id`, `tenant`, `order`, timestamps, array-row `id`s)
 * never leaks into a page, and `tsc` holds the output to those types. Images become `RemotePhoto`s
 * (absolute URL + intrinsic size); everything else must round-trip byte-for-byte.
 *
 * The mappers are shared across every niche template because the content model is: a template's
 * freedom is which fields it renders, not what a field means. `test/cms.map.test.ts` asserts the
 * mapping rules against real hub responses in `test/__fixtures__/`; each template additionally
 * asserts that those rules reproduce its own `src/data`.
 */
import { SERVICE_ICONS } from './serviceIcons.js';
import type { RemotePhoto } from './photo.js';
import type {
  Faq,
  GalleryImage,
  Intro,
  NavLink,
  ProcessStep,
  Service,
  ShortIntro,
  SiteContent,
  SiteSettings,
  Social,
  Stat,
  Testimonial,
} from './types.js';

// ---- input (what the hub actually serves; see test/__fixtures__/) ---------------------------------

/** A populated `media` relation. Videos have `null` dimensions. */
export interface HubMedia {
  url: string;
  width: number | null;
  height: number | null;
}
/** Payload gives every array row an `id`; groups get none. */
type Row<T> = T & { id?: string | null };
type TextRows = Row<{ text: string }>[] | null | undefined;
/** Select fields arrive as plain strings; `oneOf` narrows them to what the components render. */
type Select = string;
/**
 * An optional hub text field. Payload answers `null` for one a client left empty — not absence —
 * so every optional string the hub can send is typed here, and `opt` turns both into a missing key.
 */
type OptionalText = string | null | undefined;

export interface HubSiteDoc {
  name: string;
  tagline: string;
  description: string;
  heroHeadline: string;
  /** Optional in the hub, so `null` on most tenants. */
  heroEyebrow?: OptionalText;
  nav?: Row<NavLink>[] | null;
  navCta: NavLink;
  heroCta: NavLink;
  labels: SiteSettings['labels'];
  socials?: Row<{ label: Select; href: string }>[] | null;
  /** `serviceArea` / `hours` are optional, and the hub sends `null` rather than omitting them. */
  footer: Omit<SiteSettings['footer'], 'serviceArea' | 'hours'> & {
    serviceArea?: OptionalText;
    hours?: OptionalText;
  };
  copyright: string;
  heroPhone: SiteSettings['heroPhone'];
  /** Optional: a tenant with no stock footage leaves it empty and the hero falls back to the poster. */
  heroVideo?: HubMedia | number | string | null;
  heroPoster: HubMedia;
  avatars: Row<{ image: HubMedia }>[];
  review: SiteSettings['review'];
  heroBadge: SiteSettings['heroBadge'];
  licenseNumber?: OptionalText;
  aboutHeading: string;
  trustCard: { title: string; body: string; bullets?: TextRows };
  aboutCards: Row<{ title: string; body: string }>[];
  servicesIntro: Intro;
  workIntro: Intro;
  featuredProject: SiteContent['featuredProject'];
  testimonialsIntro: ShortIntro;
  impactIntro: ShortIntro;
  processIntro: Intro;
  faqIntro: Intro;
  faqSideCard: SiteContent['faqSideCard'];
  ctaBand: SiteContent['ctaBand'];
  ctaStrip?: Row<{ image: HubMedia; alt: string }>[] | null;
}
export interface HubServiceDoc {
  icon: Select;
  title: string;
  blurb: string;
  bullets?: TextRows;
  image: HubMedia;
  imageAlt: string;
}
export interface HubProjectDoc {
  image: HubMedia;
  alt: string;
  emphasis: Select;
}
export interface HubTestimonialDoc {
  quote: string;
  author: string;
  /** Optional: niches without before/after photography (HVAC, plumbing) run quote-only cards. */
  image?: HubMedia | number | string | null;
  beforeImage?: HubMedia | number | string | null;
  alt: string;
}
export type HubProcessStepDoc = ProcessStep;
export interface HubStatDoc {
  value: string;
  label: string;
}
export type HubFaqDoc = Faq;

// ---- helpers ------------------------------------------------------------------------------

/**
 * A populated media relation, or a build error that names the field and the fix. `field` is the
 * hub path the operator sees in the admin (`site.heroPoster`, `services[1] "Lawn Care".image`).
 */
export function media(field: string, m: HubMedia | number | string | null | undefined): HubMedia {
  if (m == null) throw new Error(`CMS ${field}: no image set — upload one in the hub`);
  if (typeof m !== 'object' || typeof m.url !== 'string') {
    throw new Error(`CMS ${field}: relation not populated (got ${JSON.stringify(m)}); fetch with depth=1`);
  }
  return m;
}

/** A populated *image* media doc → `RemotePhoto`. Videos (no dimensions) are rejected by name. */
export function photo(field: string, m: HubMedia | number | string | null | undefined): RemotePhoto {
  const doc = media(field, m);
  if (typeof doc.width !== 'number' || typeof doc.height !== 'number') {
    throw new Error(`CMS ${field}: media has no width/height (is it an image?)`);
  }
  return { src: doc.url, width: doc.width, height: doc.height };
}

const texts = (rows: TextRows): string[] => (rows ?? []).map((r) => r.text);

/**
 * An optional hub text field as a spreadable object — the key exists only when the operator set it.
 * Payload answers `null` or `''` for an untouched optional text, while a template that does not use
 * the field has no key at all in `src/data`, and `{ key: undefined }` is not the same object as one
 * without the key (the per-template fixture tests compare with `toStrictEqual`).
 */
const opt = <K extends string>(key: K, value: string | null | undefined) =>
  (value ? { [key]: value } : {}) as { [P in K]?: string };

/** `collection[i] "title"` — how every per-document error names the document. */
const at = (collection: string, i: number, title?: string) =>
  title == null ? `${collection}[${i}]` : `${collection}[${i}] ${JSON.stringify(title)}`;

/** Narrow a Payload select value to the template's union, failing loudly on anything else. */
function oneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`CMS ${field}: unexpected value ${JSON.stringify(value)} (allowed: ${allowed.join(', ')})`);
}

/**
 * Every member of a string union as a runtime list. The argument must have exactly the union's
 * members as keys, so adding a member to a `src/data` type without listing it here is a compile
 * error (a missing key) — the allowed-value lists below can never drift from the types.
 */
const keys = <U extends string>(r: Record<U, true>): U[] => Object.keys(r) as U[];

const SOCIALS = keys<Social['label']>({ x: true, linkedin: true, facebook: true, instagram: true });
/**
 * The shared vocabulary itself, not a copy: `Service['icon']` is derived from `SERVICE_ICONS`, so
 * the allowed list can never drift from the type. A value here may still have no artwork in a given
 * template — that template warns (see `Cms.warnMissingIcon`) and draws a placeholder rather than
 * failing the build, because the vocabulary is deliberately wider than any one niche.
 */
const ICONS: readonly Service['icon'][] = SERVICE_ICONS;
const EMPHASIS = keys<GalleryImage['emphasis']>({ featured: true, standard: true });

// ---- mappers ------------------------------------------------------------------------------

export function mapSite(doc: HubSiteDoc): SiteContent {
  const { footer, heroPhone, review, heroBadge } = doc;
  return {
    site: {
      name: doc.name,
      tagline: doc.tagline,
      description: doc.description,
      heroHeadline: doc.heroHeadline,
      ...opt('heroEyebrow', doc.heroEyebrow),
      nav: (doc.nav ?? []).map(({ label, href }) => ({ label, href })),
      navCta: { label: doc.navCta.label, href: doc.navCta.href },
      heroCta: { label: doc.heroCta.label, href: doc.heroCta.href },
      heroPhone: { display: heroPhone.display, tel: heroPhone.tel },
      footer: {
        email: footer.email,
        phone: { display: footer.phone.display, tel: footer.phone.tel },
        address: footer.address,
        ...opt('serviceArea', footer.serviceArea),
        ...opt('hours', footer.hours),
      },
      review: { summary: review.summary },
      heroBadge: { value: heroBadge.value, label: heroBadge.label },
      ...opt('licenseNumber', doc.licenseNumber),
      labels: {
        callPrefix: doc.labels.callPrefix,
        footerEmail: doc.labels.footerEmail,
        footerPhone: doc.labels.footerPhone,
        footerAddress: doc.labels.footerAddress,
        footerServiceArea: doc.labels.footerServiceArea,
        footerHours: doc.labels.footerHours,
      },
      socials: (doc.socials ?? []).map(({ label, href }, i) => ({
        label: oneOf(`${at('site.socials', i)}.label`, label, SOCIALS),
        href,
      })),
      copyright: doc.copyright,
    },
    hero: {
      // Optional: an unset upload is `null`/absent, and the key is then omitted entirely so a
      // template's `hero.video === undefined` branch matches a template with no video in `src/data`.
      ...opt('video', doc.heroVideo == null ? undefined : media('site.heroVideo', doc.heroVideo).url),
      poster: photo('site.heroPoster', doc.heroPoster),
      avatars: doc.avatars.map((a, i) => photo(`${at('site.avatars', i)}.image`, a.image)),
    },
    aboutHeading: doc.aboutHeading,
    trustCard: { title: doc.trustCard.title, body: doc.trustCard.body, bullets: texts(doc.trustCard.bullets) },
    aboutCards: doc.aboutCards.map(({ title, body }) => ({ title, body })),
    servicesIntro: intro(doc.servicesIntro),
    workIntro: intro(doc.workIntro),
    featuredProject: { title: doc.featuredProject.title, subtitle: doc.featuredProject.subtitle },
    testimonialsIntro: shortIntro(doc.testimonialsIntro),
    impactIntro: shortIntro(doc.impactIntro),
    processIntro: intro(doc.processIntro),
    faqIntro: intro(doc.faqIntro),
    faqSideCard: {
      title: doc.faqSideCard.title,
      body: doc.faqSideCard.body,
      cta: doc.faqSideCard.cta,
      href: doc.faqSideCard.href,
    },
    ctaBand: {
      heading: doc.ctaBand.heading,
      copy: doc.ctaBand.copy,
      button: doc.ctaBand.button,
      href: doc.ctaBand.href,
    },
    ctaStrip: (doc.ctaStrip ?? []).map((c, i) => ({
      image: photo(`${at('site.ctaStrip', i)}.image`, c.image),
      alt: c.alt,
    })),
  };
}
const intro = ({ chip, heading, copy }: Intro): Intro => ({ chip, heading, copy });
const shortIntro = ({ chip, heading }: ShortIntro): ShortIntro => ({ chip, heading });

export const mapServices = (docs: HubServiceDoc[]): Service[] =>
  docs.map((d, i) => {
    const doc = at('services', i, d.title);
    return {
      icon: oneOf(`${doc}.icon`, d.icon, ICONS),
      title: d.title,
      blurb: d.blurb,
      bullets: texts(d.bullets),
      image: photo(`${doc}.image`, d.image),
      imageAlt: d.imageAlt,
    };
  });

/** The `projects` collection is the work gallery only; the CTA strip lives on `site`. */
export const mapProjects = (docs: HubProjectDoc[]): GalleryImage[] =>
  docs.map((d, i) => ({
    image: photo(`${at('projects', i)}.image`, d.image),
    alt: d.alt,
    emphasis: oneOf(`${at('projects', i)}.emphasis`, d.emphasis, EMPHASIS),
  }));

/**
 * `image` / `beforeImage` are optional in the hub: a card may show a before/after slider (both), a
 * plain photo (`image` only) or nothing but the quote. An unset relation is omitted rather than
 * mapped to `undefined`, so the mapped document has exactly the keys the hub filled in; a *set* but
 * unpopulated relation still fails by name, because that one is a depth/config mistake.
 */
export const mapTestimonials = (docs: HubTestimonialDoc[]): Testimonial[] =>
  docs.map((d, i) => ({
    quote: d.quote,
    author: d.author,
    ...(d.image == null ? {} : { image: photo(`${at('testimonials', i)}.image`, d.image) }),
    ...(d.beforeImage == null ? {} : { beforeImage: photo(`${at('testimonials', i)}.beforeImage`, d.beforeImage) }),
    alt: d.alt,
  }));

export const mapProcess = (docs: HubProcessStepDoc[]): ProcessStep[] =>
  docs.map(({ title, body }) => ({ title, body }));

export const mapStats = (docs: HubStatDoc[]): Stat[] => docs.map(({ value, label }) => ({ value, label }));

export const mapFaqs = (docs: HubFaqDoc[]): Faq[] => docs.map(({ question, answer }) => ({ question, answer }));
