import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

const site = process.env.PUBLIC_SITE_URL || 'http://localhost:4321';

export default defineConfig({
  site,
  output: 'static',
  adapter: vercel(),
  integrations: [react()],
  server: {
    port: 4321,
  },
});
