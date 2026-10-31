import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

const root = path.dirname(fileURLToPath(import.meta.url));
const studioStrings = path.resolve(root, '../studio/schemaTypes/lib/uiStringDefaults.ts');
const studioRoot = path.resolve(root, '../studio');

const site = process.env.PUBLIC_SITE_URL || 'http://localhost:4321';

export default defineConfig({
  site,
  output: 'static',
  adapter: vercel(),
  integrations: [react()],
  server: {
    port: 4321,
  },
  vite: {
    resolve: {
      alias: {
        '@studio-strings': studioStrings,
      },
    },
    server: {
      fs: {
        allow: [root, studioRoot],
      },
    },
  },
});
