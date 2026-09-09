import type { ImageMetadata } from 'astro';

/**
 * A photo served by the hub (R2 media doc): absolute URL plus intrinsic size. `format?: never`
 * makes the union discriminable on `'format' in p` (local metadata always has one).
 */
export type RemotePhoto = { src: string; width: number; height: number; format?: never };

/** Either a locally imported asset or a remote hub photo. */
export type Photo = ImageMetadata | RemotePhoto;

const ABSOLUTE_HTTP = /^https?:\/\//;

/**
 * Remote photos carry an absolute http(s) URL (including `http://localhost:…`
 * against a dev hub); a local `ImageMetadata.src` is `/_astro/…` in builds or
 * `/src/assets/…` in dev.
 *
 * Local metadata is ruled out with `in` (always has `format`) *before* the URL
 * test on purpose: in a production build an imported image is a Proxy whose
 * `get` trap marks the original file as referenced and copies the unoptimized
 * JPG into `dist/`. `in` goes through `has`, which the Proxy doesn't trap.
 * `isLocal` is a predicate because TS keeps a member with an *optional*
 * `format?: never` in both branches of a bare `'format' in p` check.
 */
export const isLocal = (p: Photo): p is ImageMetadata => 'format' in p;

export const isRemote = (p: Photo): p is RemotePhoto => !isLocal(p) && ABSOLUTE_HTTP.test(p.src);

/**
 * Props for astro:assets <Image> for either a local import or a remote R2 photo.
 * Spread it first at call sites (`<Image {...imageProps(x)} width={…} …>`) so explicit props win.
 *
 * A remote photo with a relative `src` (a Payload `url` served without a host) is rejected here:
 * left alone it surfaces later as an opaque Astro `UnsupportedImageFormat`, or as a raw URL in the
 * `srcset` that only works in dev.
 */
export function imageProps(p: Photo) {
  if (isLocal(p)) return { src: p };
  if (!ABSOLUTE_HTTP.test(p.src)) {
    throw new Error(`Remote photo src must be an absolute http(s) URL, got "${p.src}"`);
  }
  return { src: p.src, width: p.width, height: p.height };
}
