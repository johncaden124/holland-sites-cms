/**
 * Astro integrations shared by every niche template on this hub.
 *
 * Type-only import of `astro`, so this module still costs a consumer nothing at runtime — but it is
 * the one entry point here that genuinely needs the (optional) astro peer, which every template has
 * as a direct dependency anyway.
 */
import type { AstroIntegration } from 'astro';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

/**
 * Delete `public/` assets from `dist/` that only the standalone build uses.
 *
 * Astro copies `public/` verbatim into every build. That is right for a standalone template, where
 * `public/hero.mp4` *is* the hero video — and wrong for a hub-driven client build, where the hero
 * video is a tenant upload served from R2 and the committed file is never referenced by a single
 * byte of the output. The landscaping template's is 9.3 MB, shipped on every deploy of every client
 * site built from it.
 *
 * Nothing is deleted on the strength of the flag alone: a file still referenced by the built HTML
 * is kept and reported, so a template that starts using one of these paths for something else
 * cannot silently lose it.
 *
 * @param enabled Whether this is a CMS-mode build — the caller decides, since only it can see the
 *   environment (`!!(PAYLOAD_URL && PAYLOAD_API_KEY)`).
 * @param files `public/`-relative paths as they appear in the output, e.g. `['/hero.mp4']`.
 */
export function pruneStandaloneMedia({ enabled, files }: { enabled: boolean; files: string[] }): AstroIntegration {
  return {
    name: '@hollandtech/site-cms:prune-standalone-media',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        if (!enabled || files.length === 0) return;
        const root = dir.pathname;
        const html = await readAllHtml(root);

        for (const file of files) {
          const path = join(root, file.replace(/^\/+/, ''));
          const size = await stat(path).then(
            (s) => s.size,
            () => undefined,
          );
          if (size === undefined) continue;

          const referencedIn = html.find(([, body]) => referencesPath(body, file));
          if (referencedIn) {
            logger.warn(`kept ${file}: still referenced by ${relative(root, referencedIn[0])}`);
            continue;
          }
          await rm(path);
          logger.info(`pruned ${file} (${(size / 1024 / 1024).toFixed(1)} MB) — CMS builds serve it from the hub`);
        }
      },
    },
  };
}

/**
 * Does `html` reference `file` as a URL in its own right?
 *
 * Not a substring test. In CMS mode the hub serves the same basename from its own route —
 * `http://localhost:3000/api/media/file/hero.mp4?prefix=1` contains `/hero.mp4` — so a plain
 * `includes` reads every CMS build as still needing the local copy, which is exactly backwards.
 * Require a URL boundary before the path and a terminator after it, so only a reference that
 * *starts* at this path counts.
 */
function referencesPath(html: string, file: string): boolean {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|["'(\\s,=])${escaped}(?=["')\\s,?#]|$)`).test(html);
}

/** Every built HTML file as `[absolutePath, contents]`. */
async function readAllHtml(root: string): Promise<[string, string][]> {
  const out: [string, string][] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.html')) out.push([path, await readFile(path, 'utf8')]);
    }
  };
  await walk(root);
  return out;
}
