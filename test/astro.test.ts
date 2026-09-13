/**
 * `pruneStandaloneMedia` — the one module here that deletes files, so the tests run it against a
 * real directory tree rather than a mocked `fs`.
 *
 * The rule under test is narrow and was got wrong once (`6688965` matched a substring, so the hub's
 * own `/api/media/file/hero.mp4?prefix=1` read as a reference to the local `/hero.mp4` and nothing
 * was ever pruned): a `public/` file is deleted only when *no* built output addresses that exact
 * URL. Every case below is either that rule or a way of not applying it at all.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pruneStandaloneMedia } from '../src/astro.js';

/** Temp trees to remove after each test. */
const trees: string[] = [];
afterEach(async () => {
  await Promise.all(trees.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A throwaway `dist/` containing exactly `files` (path relative to the root → contents). */
async function built(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'site-cms-prune-'));
  trees.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, contents);
  }
  return root;
}

const exists = (path: string): Promise<boolean> => stat(path).then(() => true, () => false);

interface Log {
  info: string[];
  warn: string[];
}

/**
 * Run the integration's `astro:build:done` hook over `root`.
 *
 * The hook reads exactly two things off its argument — `dir.pathname` and `logger` — so the fake is
 * those two and a cast, rather than a whole `AstroIntegration` context nothing would read.
 */
async function run(root: string, options: { enabled: boolean; files: string[] }): Promise<Log> {
  const log: Log = { info: [], warn: [] };
  const logger = { info: (m: string) => log.info.push(m), warn: (m: string) => log.warn.push(m) };
  const hook = pruneStandaloneMedia(options).hooks['astro:build:done'];
  // A trailing slash so `dir` is a directory URL, which is what Astro passes.
  await hook!({ dir: pathToFileURL(`${root}/`), logger } as never);
  return log;
}

/** The hub's own route for the same basename: the URL that `6688965` mistook for a local reference. */
const HUB_VIDEO = 'http://localhost:3000/api/media/file/hero.mp4?prefix=42';

describe('pruneStandaloneMedia', () => {
  it('deletes a public file no built page refers to, and says how much it saved', async () => {
    const root = await built({
      'index.html': `<video poster="${HUB_VIDEO}"></video>`,
      'hero.mp4': 'x'.repeat(2 * 1024 * 1024),
    });

    const log = await run(root, { enabled: true, files: ['/hero.mp4'] });

    expect(await exists(join(root, 'hero.mp4'))).toBe(false);
    expect(log.warn).toEqual([]);
    expect(log.info[0]).toMatch(/^pruned \/hero\.mp4 \(2\.0 MB\)/);
  });

  it('keeps a file the built page still references, and names the page', async () => {
    const root = await built({
      'index.html': '<video><source src="/hero.mp4" /></video>',
      'hero.mp4': 'video',
    });

    const log = await run(root, { enabled: true, files: ['/hero.mp4'] });

    expect(await exists(join(root, 'hero.mp4'))).toBe(true);
    expect(log.warn).toEqual(['kept /hero.mp4: still referenced by index.html']);
    expect(log.info).toEqual([]);
  });

  it('does not read the hub serving the same basename as a reference to the local file', async () => {
    // The regression behind `da55b06`. A substring test sees `/hero.mp4` inside the hub URL and
    // keeps the 9.3 MB local copy on every CMS build — exactly the builds it exists to slim down.
    const root = await built({
      'index.html': `<video poster="${HUB_VIDEO}"><source src="${HUB_VIDEO}" /></video>`,
      'hero.mp4': 'video',
    });

    const log = await run(root, { enabled: true, files: ['/hero.mp4'] });

    expect(await exists(join(root, 'hero.mp4'))).toBe(false);
    expect(log.warn).toEqual([]);
  });

  it('keeps a file referenced only from a stylesheet, not just from HTML', async () => {
    // A `public/` path can be addressed from built CSS (`background: url(/hero.jpg)`) or from a JS
    // chunk. Those are references too; pruning past them would delete an asset still in use.
    const root = await built({
      'index.html': '<link rel="stylesheet" href="/_astro/index.css" />',
      '_astro/index.css': '.hero{background:url(/hero.jpg)}',
      'hero.jpg': 'image',
    });

    const log = await run(root, { enabled: true, files: ['/hero.jpg'] });

    expect(await exists(join(root, 'hero.jpg'))).toBe(true);
    expect(log.warn).toEqual(['kept /hero.jpg: still referenced by _astro/index.css']);
  });

  it('keeps a file referenced only from a JS chunk', async () => {
    const root = await built({
      'index.html': '<script src="/_astro/hero.js"></script>',
      '_astro/hero.js': 'const src="/hero.mp4";',
      'hero.mp4': 'video',
    });

    await run(root, { enabled: true, files: ['/hero.mp4'] });

    expect(await exists(join(root, 'hero.mp4'))).toBe(true);
  });

  it('leaves a standalone build alone, however unreferenced the file is', async () => {
    const root = await built({ 'index.html': '<p>no video here</p>', 'hero.mp4': 'video' });

    const log = await run(root, { enabled: false, files: ['/hero.mp4'] });

    expect(await exists(join(root, 'hero.mp4'))).toBe(true);
    expect(log).toEqual({ info: [], warn: [] });
  });

  it('does nothing, and reads nothing, when the template lists no files', async () => {
    const root = await built({ 'index.html': '<p>hi</p>', 'hero.mp4': 'video' });

    const log = await run(root, { enabled: true, files: [] });

    expect(await exists(join(root, 'hero.mp4'))).toBe(true);
    expect(log).toEqual({ info: [], warn: [] });
  });

  it('passes over a listed file the build never emitted', async () => {
    // A template that lists a path it has since deleted from `public/` must not fail the build.
    const root = await built({ 'index.html': '<p>hi</p>' });

    const log = await run(root, { enabled: true, files: ['/hero.mp4', '/gone.jpg'] });

    expect(log).toEqual({ info: [], warn: [] });
  });

  it('tolerates a leading-slash-free path and finds pages in nested routes', async () => {
    const root = await built({
      'index.html': '<p>nothing</p>',
      'privacy/index.html': '<video><source src="/hero.mp4" /></video>',
      'hero.mp4': 'video',
    });

    const log = await run(root, { enabled: true, files: ['hero.mp4'] });

    expect(await exists(join(root, 'hero.mp4'))).toBe(true);
    expect(log.warn).toEqual(['kept hero.mp4: still referenced by privacy/index.html']);
  });
});
