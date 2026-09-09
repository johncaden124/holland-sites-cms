/**
 * The shared CMS layer for Holland Tech's niche website templates.
 *
 * One Payload hub serves many templates on one content model, so the fetch layer, the mappers, the
 * media-origin rules and the icon vocabulary are written once, here. A template contributes the
 * *values* in its `src/data`, the components that render them, and its design tokens.
 *
 * A template wires it up in its own `src/lib/cms.ts` — the one file allowed to read `import.meta.env`
 * — and destructures the getters:
 *
 * ```ts
 * import { createCms } from '@hollandtech/site-cms';
 * import { CMS_REQUIRED } from './cms.config';
 * import * as local from './cms.local';
 *
 * export const { cmsEnabled, getSite, getServices, getProjects, getTestimonials, getProcess,
 *   getStats, getFaqs, warnMissingIcon } = createCms({
 *   payloadUrl: import.meta.env.PAYLOAD_URL,
 *   apiKey: import.meta.env.PAYLOAD_API_KEY,
 *   mediaHost: import.meta.env.PUBLIC_MEDIA_HOST,
 *   cmsRequired: CMS_REQUIRED,
 *   dev: import.meta.env.DEV,
 *   local,
 * });
 * ```
 */
export { createCms, COLLECTIONS, collectionUrl, type Cms, type CmsOptions } from './cms.js';
export {
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
} from './cms.map.js';
export { imageProps, isLocal, isRemote, type Photo, type RemotePhoto } from './photo.js';
export {
  DEFAULT_MEDIA_HOST,
  mediaOrigins,
  parseMediaHost,
  parsePayloadUrl,
  type MediaOrigin,
  type MediaOrigins,
  type MediaOriginsInput,
} from './mediaOrigins.js';
export { SERVICE_ICONS, type ServiceIcon } from './serviceIcons.js';
export type {
  AboutCard,
  Faq,
  GalleryImage,
  Intro,
  LocalContent,
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
