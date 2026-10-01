/**
 * `./service-icons` must stay importable from plain Node with no Astro and no DOM — the hub imports
 * it. `scripts/check-service-icons.mjs` is the proof; this runs it with the rest of the suite.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('loads one module and touches no DOM global', () => {
  const script = fileURLToPath(new URL('../scripts/check-service-icons.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
  expect(r.stdout).toMatch(/^service-icons OK — 1 module, no DOM globals, \d+ icons, self-contained \.d\.ts\n$/);
});
