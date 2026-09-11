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

export type { Photo, RemotePhoto } from './photo.js';
export type { ServiceIcon } from './serviceIcons.js';
export { SERVICE_ICONS } from './serviceIcons.js';

// ---- site settings ---------------------------------------------------------------------------

export interface NavLink {
  label: string;
  href: string;
}

export interface Social {
  label: 'x' | 'linkedin' | 'facebook' | 'instagram';
  href: string;
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
}

/** The hub's `projects` collection — the work gallery. */
export interface GalleryImage {
  image: Photo;
  alt: string;
  /** How much room the image gets in the desktop gallery grid. */
  emphasis: 'featured' | 'standard';
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
}

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
