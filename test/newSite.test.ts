/**
 * `site-cms new-site`, end to end through the CLI, against a local git repository standing in for a
 * template — so the clone, the pinned ref and every edit are real, with no network.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { contentFileMedia, type ContentFile } from '../src/contentFile.js';
import { setEnv } from '../bin/new-site.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = resolve(ROOT, 'bin/site-cms.mjs');
const TMP = resolve(ROOT, 'test/.tmp/new-site');
const TEMPLATE = resolve(TMP, 'template');
const CLIENT = resolve(TMP, 'clients/acme');
const FIXTURE = JSON.parse(readFileSync(resolve(ROOT, 'test/__fixtures__/content.json'), 'utf8')) as ContentFile;

const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: TEMPLATE,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).trim();
/**
 * The CLI, run with no git identity anywhere (an empty HOME, no system config): what a bare CI box
 * has, and the case the first commit must survive.
 */
const newSite = (...args: string[]) =>
  spawnSync('node', [BIN, 'new-site', ...args], {
    cwd: TMP,
    encoding: 'utf8',
    env: { ...process.env, HOME: resolve(TMP, 'home'), XDG_CONFIG_HOME: resolve(TMP, 'home'), GIT_CONFIG_NOSYSTEM: '1' },
  });
/** git in a generated site. */
const gitIn = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

/** A template's commit: the files `new-site` touches, and one it must leave alone. */
function commitTemplate(cmsRequired: string) {
  mkdirSync(resolve(TEMPLATE, 'src/lib'), { recursive: true });
  writeFileSync(resolve(TEMPLATE, 'package.json'), '{ "name": "template-test", "private": true }\n');
  writeFileSync(
    resolve(TEMPLATE, 'src/lib/cms.config.ts'),
    `/** Per-repo switch. */\nexport const CMS_REQUIRED: boolean = ${cmsRequired};\n`,
  );
  writeFileSync(
    resolve(TEMPLATE, '.env.example'),
    '# Hub\nPAYLOAD_URL=\nPAYLOAD_API_KEY=\nPUBLIC_MEDIA_HOST=media.hollandtech.com\n# Leads\nRESEND_API_KEY=\n',
  );
  git('add', '-A');
  git('commit', '--quiet', '-m', `CMS_REQUIRED ${cmsRequired}`);
  return git('rev-parse', 'HEAD');
}

let pinned: string;

beforeAll(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TEMPLATE, { recursive: true });
  mkdirSync(resolve(TMP, 'home'), { recursive: true });
  git('init', '--quiet');
  pinned = commitTemplate('false');
  // A later commit on the template that the pinned ref must NOT pick up.
  commitTemplate('false /* later */');

  mkdirSync(resolve(CLIENT, 'media'), { recursive: true });
  const content = { ...FIXTURE, site: { ...FIXTURE.site, business: undefined } };
  writeFileSync(resolve(CLIENT, 'content.json'), JSON.stringify(content, null, 2));
  const { images, videos } = contentFileMedia(FIXTURE);
  for (const file of [...images, ...videos]) writeFileSync(resolve(CLIENT, 'media', file), file);
});

describe('new-site', () => {
  it('clones the pinned ref, imports the content and media, and sets CMS_REQUIRED and the env', () => {
    const r = newSite('--from', 'clients/acme/content.json', '--template', TEMPLATE, '--ref', pinned, '--out', 'acme');
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const out = resolve(TMP, 'acme');

    expect(r.stdout).toContain(`created acme from ${TEMPLATE}@${pinned}`);
    // A fresh repository, not the template's: one commit on main naming the template and its ref,
    // a clean tree, and no remote.
    expect(gitIn(out, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    expect(gitIn(out, 'log', '--format=%s|%an')).toBe(`Create acme from ${TEMPLATE}@${pinned}|site-cms`);
    expect(gitIn(out, 'status', '--porcelain')).toBe('');
    expect(gitIn(out, 'remote')).toBe('');
    expect(r.stdout).toMatch(/ {2}git {12}main @ [0-9a-f]{7,} \(no remote\)/);
    expect(readFileSync(resolve(out, 'src/lib/cms.config.ts'), 'utf8')).toBe(
      '/** Per-repo switch. */\nexport const CMS_REQUIRED: boolean = true;\n',
    );
    expect(readFileSync(resolve(out, 'src/data/site.ts'), 'utf8')).toContain("name: 'LeapFly',");
    expect(existsSync(resolve(out, 'src/assets/hero-poster.jpg'))).toBe(true);
    expect(existsSync(resolve(out, 'public/hero.mp4'))).toBe(true);
    expect(readFileSync(resolve(out, '.env.example'), 'utf8')).toBe(
      '# Hub\nPAYLOAD_URL=https://hub.hollandsites.com\nPAYLOAD_API_KEY=\nPUBLIC_MEDIA_HOST=media.hollandsites.com\n' +
        '# Leads\nRESEND_API_KEY=\nPUBLIC_SITE_URL=\n',
    );
  });

  it('leaves CMS_REQUIRED false with --no-cms-required, and no repository with --no-git', () => {
    const r = newSite(
      '--from', 'clients/acme/content.json', '--template', TEMPLATE, '--ref', pinned, '--out', 'demo', '--no-cms-required',
      '--no-git',
    );
    expect(r.status).toBe(0);
    expect(existsSync(resolve(TMP, 'demo/.git'))).toBe(false);
    expect(r.stdout).toContain('  git            not initialised (--no-git)');
    expect(readFileSync(resolve(TMP, 'demo/src/lib/cms.config.ts'), 'utf8')).toContain('CMS_REQUIRED: boolean = false;');
  });

  it('refuses a non-empty --out, and removes what it created when a later step fails', () => {
    const busy = newSite('--from', 'clients/acme/content.json', '--template', TEMPLATE, '--ref', pinned, '--out', 'acme');
    expect(busy.status).toBe(1);
    expect(busy.stdout).toBe('');
    expect(busy.stderr).toMatch(/already exists and is not empty\n$/);

    const badRef = newSite('--from', 'clients/acme/content.json', '--template', TEMPLATE, '--ref', 'no-such-ref', '--out', 'gone');
    expect(badRef.status).toBe(1);
    expect(badRef.stdout).toBe('');
    expect(badRef.stderr).toMatch(/^site-cms new-site: git fetch failed/);
    expect(existsSync(resolve(TMP, 'gone'))).toBe(false);
  });

  it('needs --ref for a template that is not in consumers.json', () => {
    const r = newSite('--from', 'clients/acme/content.json', '--template', 'someone/else', '--out', 'x');
    expect(r.status).toBe(1);
    expect(r.stderr).toBe(
      'site-cms new-site: --template someone/else is not in consumers.json, so it needs --ref <sha|tag>\n',
    );
  });
});

describe('setEnv', () => {
  it('sets a key in place, appends a missing one, and leaves the rest alone', () => {
    expect(setEnv('A=1\nB=\n# c\n', { B: 'x', D: 'y' })).toBe('A=1\nB=x\n# c\nD=y\n');
    expect(setEnv('', { A: '1' })).toBe('A=1\n');
    expect(setEnv('A=1', { B: '2' })).toBe('A=1\nB=2\n');
  });
});
