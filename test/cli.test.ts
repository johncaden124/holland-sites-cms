/**
 * The contract every `site-cms` command keeps, because the generator shells out to them: `--help`
 * exits 0 with the usage on stdout; a failure exits non-zero with **only** the error, on stderr, and
 * nothing at all on stdout.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = resolve(ROOT, 'bin/site-cms.mjs');
const TMP = resolve(ROOT, 'test/.tmp/cli');

/** Run the CLI with a clean hub environment, so a developer's exported variables cannot leak in. */
const run = (args: string[], env: Record<string, string> = {}) => {
  const { PAYLOAD_URL: _u, PAYLOAD_API_KEY: _k, ...rest } = process.env;
  return spawnSync('node', [BIN, ...args], { cwd: TMP, encoding: 'utf8', env: { ...rest, ...env } });
};

const COMMANDS = ['parity', 'export-content', 'import-content', 'new-site', 'capture-fixtures'];

beforeAll(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  writeFileSync(resolve(TMP, 'package.json'), '{ "name": "cli-test", "private": true }\n');
  writeFileSync(resolve(TMP, 'broken.json'), '{ "site": {} }\n');
});

describe('site-cms', () => {
  it('prints the command list for --help and exits 0', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    for (const command of COMMANDS) expect(r.stdout).toContain(command);
  });

  it('prints the usage to stderr and exits 1 with no command', () => {
    const r = run([]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('site-cms <command>');
  });

  it('names an unknown command on stderr and exits 1', () => {
    const r = run(['frobnicate']);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('site-cms: unknown command "frobnicate" (site-cms --help lists them)\n');
  });

  it.each(COMMANDS)('%s --help prints its own usage and exits 0', (command) => {
    const r = run([command, '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`site-cms ${command}`);
    expect(r.stdout).toContain('Usage:');
    expect(r.stderr).toBe('');
  });

  /** Each command's cheapest real failure, and the one line it must print. */
  const failures: [string, string[], RegExp][] = [
    ['parity', ['extra'], /^site-cms parity: takes no arguments \(got extra\)\n$/],
    ['parity', [], /^site-cms parity: export PAYLOAD_URL and PAYLOAD_API_KEY for the demo tenant/],
    ['export-content', ['--bogus'], /^site-cms export-content: unknown option --bogus/],
    ['export-content', ['--out'], /^site-cms export-content: --out needs a value\n$/],
    ['import-content', [], /^site-cms import-content: which content file\?/],
    ['import-content', ['missing.json'], /^site-cms import-content: content file not found: /],
    ['import-content', ['broken.json'], /^site-cms import-content: .*broken\.json: 6 problem\(s\)\n {2}- missing "services"/],
    ['new-site', ['--from', 'x.json'], /^site-cms new-site: --template is required/],
    ['new-site', ['--from', 'broken.json', '--template', 'nope', '--out', 'o'], /^site-cms new-site: unknown template "nope"/],
    ['capture-fixtures', [], /^site-cms capture-fixtures: export PAYLOAD_URL and PAYLOAD_API_KEY/],
    ['capture-fixtures', ['--out'], /^site-cms capture-fixtures: --out needs a value\n$/],
  ];

  it.each(failures)('%s %j fails with only the error', (command, args, message) => {
    const r = run([command, ...args]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(message);
  });

  it('capture-fixtures names the URL when the hub is unreachable, and writes nothing', () => {
    // Any closed port; not 9, 1 or another fetch() "bad port", which fails before connecting.
    const r = run(['capture-fixtures', '--out', 'fixtures'], {
      PAYLOAD_URL: 'http://127.0.0.1:59999',
      PAYLOAD_API_KEY: 'k',
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(
      /^site-cms capture-fixtures: could not reach http:\/\/127\.0\.0\.1:59999\/api\/site\?depth=1&limit=100&sort=order \(ECONNREFUSED\) — check PAYLOAD_URL\n$/,
    );
    expect(existsSync(resolve(TMP, 'fixtures'))).toBe(false);
  });
});
