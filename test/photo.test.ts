import { describe, expect, it } from 'vitest';
import { imageProps, isRemote, type Photo } from '../src/photo.js';

const localMeta = (src: string) => ({ src, width: 10, height: 5, format: 'jpg' }) as unknown as Photo;

describe('imageProps', () => {
  it('passes local ImageMetadata through as src', () => {
    const meta = localMeta('/_astro/x.jpg');
    expect(imageProps(meta)).toEqual({ src: meta });
  });

  it('spreads remote photos into src/width/height', () => {
    expect(imageProps({ src: 'https://m/x.jpg', width: 10, height: 5 })).toEqual({
      src: 'https://m/x.jpg',
      width: 10,
      height: 5,
    });
  });

  it('treats an http://localhost dev-hub URL as remote', () => {
    const p = { src: 'http://localhost:3000/api/media/file/x.jpg', width: 1600, height: 900 };
    expect(isRemote(p)).toBe(true);
    expect(imageProps(p)).toEqual(p);
  });

  it('does not treat a dev-server local src as remote', () => {
    expect(isRemote(localMeta('/src/assets/x.jpg'))).toBe(false);
  });

  it('throws on a relative remote src (a host-less Payload url) naming the src', () => {
    expect(() => imageProps({ src: '/api/media/file/x.jpg', width: 1, height: 1 })).toThrow(
      '/api/media/file/x.jpg',
    );
  });

  it('never reads properties of local metadata (Astro build Proxy marks the original as referenced)', () => {
    // This recording Proxy is deliberately stricter than Astro's: Astro only traps `get`, but any
    // property read here (even `src`) fails the test so the `in`-first ordering can't regress.
    const reads: PropertyKey[] = [];
    const proxied = new Proxy(localMeta('/_astro/x.jpg') as object, {
      get(target, name) {
        reads.push(name);
        return Reflect.get(target, name);
      },
    }) as Photo;
    const remote = isRemote(proxied);
    const props = imageProps(proxied);
    // Assert before any matcher touches `proxied` (deep-equality walks it).
    expect(reads).toEqual([]);
    expect(remote).toBe(false);
    expect(props.src).toBe(proxied);
  });
});
