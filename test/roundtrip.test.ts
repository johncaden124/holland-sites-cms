/**
 * `import-content` and `export-content` are inverses, end to end through the real CLI.
 *
 * The fixture is the hub's own `clients/demo-landscaping/content.json` — the file `export-content`
 * produced from the landscaping template and `seed:tenant` consumes — so this is the generator's
 * path exactly: content file → `src/data` → content file → `src/data`.
 *
 * Runs against `dist/` and `bin/` (the `pretest` script builds), and loads the generated modules
 * through Vite as the exporter does in a template, resolved from this repo's own `astro` devDependency.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { contentFileMedia, type ContentFile } from '../src/contentFile.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = resolve(ROOT, 'bin/site-cms.mjs');
const FIXTURE = resolve(ROOT, 'test/__fixtures__/content.json');
const TMP = resolve(ROOT, 'test/.tmp/roundtrip');
const SITE = resolve(TMP, 'site');

const cli = (cwd: string, ...args: string[]) => execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });

const readData = () =>
  Object.fromEntries(
    readdirSync(resolve(SITE, 'src/data'))
      .sort()
      .map((f) => [f, readFileSync(resolve(SITE, 'src/data', f), 'utf8')]),
  );

describe('export-content → import-content round trip', () => {
  let firstImport: Record<string, string>;

  beforeAll(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(SITE, { recursive: true });
    writeFileSync(resolve(SITE, 'package.json'), '{ "name": "roundtrip-site", "private": true, "type": "module" }\n');
    // Stand-in media: the round trip is about content, so any bytes will do.
    const media = resolve(TMP, 'media');
    mkdirSync(media);
    const { images, videos } = contentFileMedia(JSON.parse(readFileSync(FIXTURE, 'utf8')) as ContentFile);
    for (const file of [...images, ...videos]) writeFileSync(resolve(media, file), file);

    cli(SITE, 'import-content', FIXTURE, '--media', media);
    firstImport = readData();
  }, 60_000);

  it('writes the ten data modules, images into src/assets and the video into public', () => {
    expect(Object.keys(firstImport)).toStrictEqual([
      'about.ts',
      'cta.ts',
      'faqs.ts',
      'gallery.ts',
      'hero.ts',
      'process.ts',
      'services.ts',
      'site.ts',
      'stats.ts',
      'testimonials.ts',
    ]);
    expect(readdirSync(resolve(SITE, 'public'))).toStrictEqual(['hero.mp4']);
    expect(firstImport['hero.ts']).toContain("import heroPoster from '../assets/hero-poster.jpg';");
    expect(firstImport['hero.ts']).toContain("video: '/hero.mp4',");
  });

  it('exports back to the same content file, byte for byte', () => {
    cli(SITE, 'export-content', '--out', 'content-export/content.json', '--validate');
    const exported = readFileSync(resolve(SITE, 'content-export/content.json'), 'utf8');
    expect(JSON.parse(exported)).toStrictEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
    expect(exported).toBe(readFileSync(FIXTURE, 'utf8'));
  }, 60_000);

  it('re-imports the exported file to byte-identical src/data', () => {
    cli(SITE, 'import-content', 'content-export/content.json');
    expect(readData()).toStrictEqual(firstImport);
  });
});
