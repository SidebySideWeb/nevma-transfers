import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@studio-strings': path.resolve(root, '../studio/schemaTypes/lib/uiStringDefaults.ts'),
      'server-only': path.resolve(root, 'src/test/empty.ts'),
      '@tem/db-harness': path.resolve(root, '../../packages/db/tests/harness.mjs'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    fileParallelism: false,
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
