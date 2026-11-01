import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '../..');
const studioStrings = path.resolve(root, '../studio/schemaTypes/lib/uiStringDefaults.ts');
const studioRoot = path.resolve(root, '../studio');
const serverOnlyStub = path.resolve(root, 'src/test/empty.ts');

// Ensure server secrets from `.env` are on process.env during `getStaticPaths` / prerender.
for (const envFile of [path.join(root, '.env'), path.join(repoRoot, '.env')]) {
  if (!fs.existsSync(envFile)) continue;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value;
  }
}

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
        // Astro/Vite has no `react-server` condition; the real package always throws.
        'server-only': serverOnlyStub,
      },
    },
    server: {
      fs: {
        allow: [root, studioRoot, repoRoot],
      },
    },
  },
});

