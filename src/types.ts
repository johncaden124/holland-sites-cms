/**
 * The content model every niche template on this hub shares — one type per hub collection, plus the
 * `SiteContent` shape `mapSite` returns.
 *
 * The package owns the *types*; each template's `src/data/*.ts` provides *values* typed by them, and
 * a template's only real freedom is which of these fields it renders and how, which lives in its
 * `.astro` files. Adding a field here is therefore a change to the hub schema and to every
 * template at once — which is the point of having one copy of it.
 *
 * Nothing here has a runtime footprint except `SERVICE_ICONS`, re-exported so a template can render
 * the vocabulary without a second import path.
 */
import type { Photo } from './photo.js';
import type { ServiceIcon } from './serviceIcons.js';
import type { Trade } from './trades.js';

export type { Photo, RemotePhoto } from './photo.js';
export type { ServiceIcon } from './serviceIcons.js';
export type { Trade } from './trades.js';
export { SERVICE_ICONS } from './serviceIcons.js';
export { TRADES } from './trades.js';

// ---- site settings ---------------------------------------------------------------------------

export interface NavLink {
  label: string;
  href: string;
}

export interface Social {
  /**
   * Which network; a template picks the glyph and the accessible name by it. There is deliberately
   * no `google`: the Google Business Profile link is `business.gbp.url`, and a template that shows
   * a Google icon renders it from there rather than from a second copy of the same URL.
   */
  label: 'x' | 'linkedin' | 'facebook' | 'instagram' | 'yelp' | 'nextdoor' | 'youtube' | 'tiktok';
  href: string;
}

// ---- the business behind the site (optional, v0.6) -------------------------------------------
//
// The strings above (`footer.address`, `footer.hours`, `heroPhone.display`) are what a template
// *renders*. The shapes below are the same facts in machine-readable form — for LocalBusiness
// structured data, the map embed, click-to-call tracking and the generator — so a template reads
// the structured value when it needs one and the display string when it prints one. Every group is
// optional: v0.5 content without them is still valid content.

/** A postal address, in schema.org `PostalAddress` terms. */
export interface PostalAddress {
  /** `streetAddress`: "1700 Broadway, Suite 200". */
  street: string;
  /** `addressLocality`: the town or city. */
  locality: string;
  /** `addressRegion`: the state, as its postal abbreviation ("CO"). */
  region: string;
  postalCode: string;
  /**
   * ISO 3166-1 alpha-2 country code.
   * @pattern ^[A-Z]{2}$
   */
  country: string;
}

export interface Geo {
  /**
   * @minimum -90
   * @maximum 90
   */
  lat: number;
  /**
   * @minimum -180
   * @maximum 180
   */
  lng: number;
}

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

/**
 * One row of opening hours, shaped so it serialises straight into a schema.org
 * `OpeningHoursSpecification` (`dayOfWeek`, `opens`, `closes`). 24/7 is every day, `00:00`–`23:59`.
 */
export interface OpeningHours {
  dayOfWeek: DayOfWeek[];
  /**
   * 24-hour `HH:MM`.
   * @pattern ^([01]\d|2[0-3]):[0-5]\d$
   */
  opens: string;
  /**
   * 24-hour `HH:MM`.
   * @pattern ^([01]\d|2[0-3]):[0-5]\d$
   */
  closes: string;
}

/**
 * The business's structured facts. `phone` is the **Holland tracking number** — the one every call
 * button dials and every call is counted on — which may differ from the client's own line.
 */
export interface BusinessProfile {
  trade: Trade;
  /** The home town the copy leads with ("Westerville"). */
  town: string;
  /** Every town the business serves, home town included, in the order to list them. */
  serviceAreaTowns: string[];
  address: PostalAddress;
  geo: Geo;
  openingHours: OpeningHours[];
  phone: {
    /**
     * E.164: `+` then country code and number, no spaces ("+16145550123").
     * @pattern ^\+[1-9]\d{7,14}$
     */
    e164: string;
    /** How to print it ("(614) 555-0123"). Absent: a template formats `e164` itself. */
    display?: string;
  };
  email: string;
  /**
   * The site's canonical origin, `https://` and no path ("https://acme-hvac.com").
   * @pattern ^https://[^/]+$
   */
  siteUrl: string;
  /** Google Business Profile. */
  gbp?: {
    /** @pattern ^https:// */
    url: string;
    placeId: string;
  };
  /** The review summary the site quotes. `site.review.summary` is its rendered sentence. */
  reviews?: {
    /** @minimum 0 */
    count: number;
    /**
     * @minimum 0
     * @maximum 5
     */
    rating: number;
  };
  /**
   * The year the business started (v0.8), for schema.org `foundingDate`. Distinct from
   * `copy.tenure`, which is a copy input that goes stale every January.
   * @minimum 1800
   * @maximum 2100
   */
  foundingYear?: number;
  /**
   * schema.org `priceRange` (v0.8): `$` to `$$$$`. Optional because most clients never state one.
   * @pattern ^\${1,4}$
   */
  priceRange?: string;
}

/** The one thing a client says sets them apart; the generator picks a copy block per value. */
export type Differentiator = 'same-day' | '24-7' | 'family-owned' | 'licensed-insured' | 'free-estimates' | 'none';

/**
 * The five inputs the generator interpolates into a fixed per-trade copy block. These are *inputs*,
 * not output slots: the hero headline, subhead, about copy, CTA and meta description are derived
 * from them when a site is generated, and stored in their own fields above, never here.
 */
export interface CopyInputs {
  /** Always equal to `site.name` when both are set; `validateSiteContent` enforces it. */
  businessName: string;
  town: string;
  /** The service the copy leads with ("AC repair"). */
  primaryService: string;
  differentiator: Differentiator;
  /**
   * Years in business, or `null` when the client has not said — distinct from absent, which means
   * the copy block was never filled in.
   * @minimum 0
   */
  tenure: number | null;
}

/**
 * Build-time switches the content carries rather than the environment. Each is off unless present
 * and `true`; content mapped from the hub carries a flag only when it is on.
 */
export interface SiteFlags {
  /** The review count and rating come from the Google Business Profile, not from typed copy. */
  reviewsFromGbp?: boolean;
  /** A preview of a site not yet sold or not yet live: templates may watermark it or noindex it. */
  isPreview?: boolean;
}

// ---- pricing (optional, v0.8) ------------------------------------------------------------------

/** How often a plan's `price` is charged. */
export type PricingCadence = 'visit' | 'month' | 'year' | 'one-time';

/**
 * One published plan or price ("Standard Tune-Up, $89 per visit"; "Comfort Club, $19 a month"). A
 * handful per site at most, so plans live on the `site` document rather than in a collection of
 * their own.
 */
export interface PricingPlan {
  name: string;
  /**
   * In whole currency units or with cents (89, 19.5). A number, not a string, so it can become a
   * schema.org `Offer.price`; a template formats it.
   * @minimum 0
   */
  price: number;
  cadence: PricingCadence;
  /** One or two sentences under the price. */
  blurb?: string;
  /** What the plan includes, one line each. */
  features: string[];
  cta: NavLink;
  /** The plan a template highlights. At most one should set it; templates highlight the first. */
  recommended?: boolean;
}

/** The pricing section: its intro and the plans, in display order. */
export interface PricingSection {
  intro: Intro;
  /** @minItems 1 */
  plans: PricingPlan[];
}

// ---- trade details (optional, v0.9) -----------------------------------------------------------

/**
 * Whether the business takes emergency calls, and when. HVAC reads it (a no-heat call at 2 a.m. is
 * the job); a lawn-care site leaves it out.
 */
export interface EmergencyService {
  available: boolean;
  /** When emergency calls are taken, as the business words it ("24/7, holidays included"). */
  hours?: string;
}

/** The equipment an HVAC business works on. */
export const HVAC_SYSTEMS = ['furnace', 'heat-pump', 'central-air', 'ductless', 'boiler', 'water-heater'] as const;
export type HvacSystem = (typeof HVAC_SYSTEMS)[number];

/** A season of the year, or all of it. */
export const SEASONS = ['spring', 'summer', 'fall', 'winter', 'year-round'] as const;
export type Season = (typeof SEASONS)[number];

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
export type Month = (typeof MONTHS)[number];

/** The months a seasonal business works ("March to November"). Wraps the year when `to` < `from`. */
export interface ServiceSeason {
  from: Month;
  to: Month;
}

/** Site-wide settings — the hub's `site` global, one document per tenant. */
export interface SiteSettings {
  name: string;
  /** Suffix of the `<title>`, not a heading — the H1 is `heroHeadline`. */
  tagline: string;
  description: string;
  /** The hero H1. One rendered line per `\n`, so a client can set their own two-line headline. */
  heroHeadline: string;
  /**
   * The hero's chip, above the H1 — the one section that had no `chip` of its own. Optional
   * because it is a design element, not a fact: a template renders it only when a client sets it
   * ("24/7 emergency · Greater Columbus"), so a niche whose hero has no room for one omits it.
   */
  heroEyebrow?: string;
  nav: NavLink[];
  /** The nav pill's call to action. */
  navCta: NavLink;
  /** The hero's primary call to action. */
  heroCta: NavLink;
  /** Phone shown in the hero ("Call us" line) */
  heroPhone: { display: string; tel: string };
  /** Contact details shown in the footer */
  footer: {
    email: string;
    phone: { display: string; tel: string };
    address: string;
    /**
     * Where the business works ("Greater Columbus, OH"). Optional: emergency trades sell it as a
     * first-class fact and templates give it a footer column, but a niche that does not show one
     * omits it rather than inventing copy.
     */
    serviceArea?: string;
    /** When they answer ("24/7", "Mon-Fri 7am-6pm"). Optional for the same reason. */
    hours?: string;
  };
  review: { summary: string };
  /**
   * The hero's value + label badge ("98% / Would recommend our service", "24/7 / A real dispatcher").
   * Named for what it is rather than what the first template put in it.
   */
  heroBadge: { value: string; label: string };
  /**
   * Contractor licence number, displayed near the copyright. Several regulated trades must show
   * one by law; optional because just as many have none.
   */
  licenseNumber?: string;
  /** Short interface strings components would otherwise hard-code, so every niche can reword them. */
  labels: {
    /** Precedes the phone number on the "call us" buttons. */
    callPrefix: string;
    /** Headings above the footer contact columns. */
    footerEmail: string;
    footerPhone: string;
    footerAddress: string;
    /** Headings for the two optional footer columns; unused when their field is unset. */
    footerServiceArea: string;
    footerHours: string;
  };
  socials: Social[];
  copyright: string;
  /** Structured business facts (v0.6). Optional: a v0.5 site has none. */
  business?: BusinessProfile;
  /**
   * Published prices (v0.8). Absent for a business that quotes every job; a template then renders
   * no pricing section rather than an empty one.
   */
  pricing?: PricingSection;
  /**
   * Short promotional lines for a ticker or banner (v0.8): "Furnace check-up $89 this month". Absent
   * or empty means no ticker.
   */
  promos?: string[];
  /** The generator's copy inputs (v0.6). */
  copy?: CopyInputs;
  flags?: SiteFlags;
  /**
   * Emergency calls (v0.9, HVAC). Absent: a template shows no emergency wording at all. Stored on
   * the hub's `trade-details` document, like every v0.9 trade fact.
   */
  emergency?: EmergencyService;
  /** The systems an HVAC business works on (v0.9), in display order. Absent or empty: not shown. */
  systems?: HvacSystem[];
  /** The months a seasonal business works (v0.9, landscaping). Absent: year-round, or not said. */
  serviceSeason?: ServiceSeason;
}

// ---- list collections -------------------------------------------------------------------------

/** One card in the about section. */
export interface AboutCard {
  title: string;
  body: string;
}

/** The hub's `services` collection. */
export interface Service {
  icon: ServiceIcon;
  title: string;
  blurb: string;
  bullets: string[];
  image: Photo;
  imageAlt: string;
  /** A short price cue ("From $89", "Free estimate"). Free text: trades price too differently to type. */
  priceHint?: string;
  /**
   * The service's URL segment (v0.8), for templates that give each service its own page. Absent: a
   * template derives one from `title`. Set it to keep a URL stable when the title changes.
   * @pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$
   */
  slug?: string;
  /**
   * A direct 40–60 word answer to "what is this service and who needs it" (v0.8), which a service
   * page opens with — the passage answer engines quote.
   */
  answer?: string;
  /** When the service is offered (v0.9, seasonal trades): "aeration" in spring and fall. Absent: always. */
  seasons?: Season[];
}

/** The hub's `projects` collection — the work gallery. */
export interface GalleryImage {
  image: Photo;
  alt: string;
  /** How much room the image gets in the desktop gallery grid. */
  emphasis: 'featured' | 'standard';
  /**
   * The job's name (v0.8): "High-efficiency AC retrofit". Absent: the project is a photo only, which
   * is all a v0.7 gallery has.
   */
  title?: string;
  /** One or two sentences on what was done (v0.8). */
  summary?: string;
  /** The services the job involved, one short line each (v0.8). */
  servicesProvided?: string[];
  /**
   * The same spot before the work (v0.8). When set, a template may render a before/after slider
   * between it and `image`; `alt` must then describe both.
   */
  beforeImage?: Photo;
}

/** The hub's `testimonials` collection. */
export interface Testimonial {
  quote: string;
  author: string;
  /**
   * The photo for this story, if there is one. HVAC and plumbing rarely have one, so a card can be
   * quote-only.
   */
  image?: Photo;
  /**
   * The same property before the work. Only meaningful alongside `image`: when both are set a
   * template may render a before/after slider between them, otherwise `image` is shown on its own.
   */
  beforeImage?: Photo;
  alt: string;
  /** Star rating, when the review had one. */
  rating?: 1 | 2 | 3 | 4 | 5;
  /**
   * When it was written, as an ISO date.
   * @pattern ^\d{4}-\d{2}-\d{2}$
   */
  date?: string;
  /** Where it was posted. `direct` is a review given to the business, not on a platform. */
  source?: TestimonialSource;
  /** Who the reviewer is to the business (v0.8): "Homeowner", "Property manager". */
  role?: string;
}

export type TestimonialSource = 'google' | 'facebook' | 'yelp' | 'nextdoor' | 'direct';

/** The hub's `process-steps` collection. */
export interface ProcessStep {
  title: string;
  body: string;
}

/** The hub's `stats` collection. */
export interface Stat {
  value: string;
  label: string;
}

/** The hub's `faqs` collection. */
export interface Faq {
  question: string;
  answer: string;
}

// ---- assembled page content --------------------------------------------------------------------

export interface Intro {
  chip: string;
  heading: string;
  copy: string;
}
export type ShortIntro = Pick<Intro, 'chip' | 'heading'>;

/**
 * The hero's media, from `site.heroVideo` / `heroPoster` / `avatars`. A template's own copy lives in
 * `src/data/hero.ts`, which is also what `site-cms export-content` reads for the basenames to seed.
 */
export interface HeroMedia {
  /**
   * The background video: an absolute URL in CMS mode, a `public/` path standalone. Absent when the
   * tenant uploaded none — stock footage is scarce for some trades, so the hub field is optional and
   * a template must fall back to `poster` alone rather than render a `<video>` with no source.
   */
  video?: string;
  poster: Photo;
  avatars: Photo[];
}

/** Everything on the page that is not one of the six list collections; `getSite()` returns it. */
export interface SiteContent {
  site: SiteSettings;
  hero: HeroMedia;
  aboutHeading: string;
  trustCard: { title: string; body: string; bullets: string[] };
  aboutCards: AboutCard[];
  servicesIntro: Intro;
  workIntro: Intro;
  featuredProject: { title: string; subtitle: string };
  testimonialsIntro: ShortIntro;
  impactIntro: ShortIntro;
  processIntro: Intro;
  faqIntro: Intro;
  faqSideCard: { title: string; body: string; cta: string; href: string };
  ctaBand: { heading: string; copy: string; button: string; href: string };
  ctaStrip: { image: Photo; alt: string }[];
}

/**
 * A template's own `src/data` assembled into the shapes the mappers return, so components consume
 * the getters without caring whether the content came from the hub or from the repo.
 */
export interface LocalContent {
  site: SiteContent;
  services: Service[];
  projects: GalleryImage[];
  testimonials: Testimonial[];
  process: ProcessStep[];
  stats: Stat[];
  faqs: Faq[];
}
