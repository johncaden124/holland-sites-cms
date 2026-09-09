/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

/**
 * Plain vitest, no Astro Vite pipeline: nothing in this package reads `import.meta.env`, imports an
 * image, or otherwise needs Astro's transforms — that is the whole point of taking the configuration
 * as arguments. A template still runs its own fixture-vs-`src/data` test through `getViteConfig`,
 * because that one does need real `ImageMetadata`.
 */
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
