/**
 * A stand-in for a template's `src/data`, so the "no hub configured" path can be tested without one.
 *
 * The content is deliberately nothing like any real template's copy — these tests assert *identity*
 * (the getters hand back exactly these objects, untouched), never words. Photos are shaped like
 * Astro's `ImageMetadata`, which is what the media-origin walk must skip.
 */
import type { LocalContent, Photo } from '../src/types.js';

const localPhoto = (src: string): Photo => ({ src, width: 10, height: 5, format: 'jpg' }) as unknown as Photo;

export const local: LocalContent = {
  site: {
    site: {
      name: 'Local Co',
      tagline: 'Local tagline',
      description: 'Local description',
      heroHeadline: 'Local\nHeadline',
      nav: [{ label: 'Services', href: '#services' }],
      navCta: { label: 'Local nav cta', href: '#faq' },
      heroCta: { label: 'Local hero cta', href: '#faq' },
      heroPhone: { display: '+1 (000) 555-0000', tel: '+10005550000' },
      footer: {
        email: 'local@example.com',
        phone: { display: '+1 (000) 555-0001', tel: '+10005550001' },
        address: '1 Local Street',
      },
      review: { summary: '5/5 locally' },
      heroBadge: { value: '100%', label: 'Would recommend locally' },
      labels: {
        callPrefix: 'Call us:',
        footerEmail: 'Email',
        footerPhone: 'Contact',
        footerAddress: 'Address',
        footerServiceArea: 'Service area',
        footerHours: 'Hours',
      },
      socials: [{ label: 'x', href: '#' }],
      copyright: '© Local Co',
    },
    hero: {
      video: '/hero.mp4',
      poster: localPhoto('/_astro/local-poster.jpg'),
      avatars: [localPhoto('/_astro/local-avatar.jpg')],
    },
    aboutHeading: 'Local about heading',
    trustCard: { title: 'Local trust', body: 'Local trust body', bullets: ['Local bullet'] },
    aboutCards: [{ title: 'Local card', body: 'Local card body' }],
    servicesIntro: { chip: 'Local', heading: 'Local services', copy: 'Local services copy' },
    workIntro: { chip: 'Local', heading: 'Local work', copy: 'Local work copy' },
    featuredProject: { title: 'Local project', subtitle: 'Local subtitle' },
    testimonialsIntro: { chip: 'Local', heading: 'Local testimonials' },
    impactIntro: { chip: 'Local', heading: 'Local impact' },
    processIntro: { chip: 'Local', heading: 'Local process', copy: 'Local process copy' },
    faqIntro: { chip: 'Local', heading: 'Local faqs', copy: 'Local faq copy' },
    faqSideCard: { title: 'Local side', body: 'Local side body', cta: 'Local cta', href: '#top' },
    ctaBand: { heading: 'Local band', copy: 'Local band copy', button: 'Local button', href: '#top' },
    ctaStrip: [{ image: localPhoto('/_astro/local-strip.jpg'), alt: 'Local strip' }],
  },
  services: [
    {
      icon: 'leaf',
      title: 'Local service',
      blurb: 'Local blurb',
      bullets: ['Local bullet'],
      image: localPhoto('/_astro/local-service.jpg'),
      imageAlt: 'Local service photo',
    },
  ],
  projects: [{ image: localPhoto('/_astro/local-project.jpg'), alt: 'Local project', emphasis: 'featured' }],
  testimonials: [{ quote: 'Local quote', author: 'Local Author', alt: 'Local testimonial' }],
  process: [{ title: 'Local step', body: 'Local step body' }],
  stats: [{ value: '1', label: 'Local stat' }],
  faqs: [{ question: 'Local question?', answer: 'Local answer.' }],
};
