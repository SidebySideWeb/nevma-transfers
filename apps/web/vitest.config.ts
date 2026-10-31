import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@studio-strings': path.resolve(root, '../studio/schemaTypes/lib/uiStringDefaults.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/booking/**/*.ts'],
      exclude: ['src/lib/booking/**/*.test.ts'],
      thresholds: {
        lines: 95,
      },
    },
  },
});
