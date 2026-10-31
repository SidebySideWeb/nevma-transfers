import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

const site = process.env.PUBLIC_ADMIN_URL || 'http://localhost:4322';

export default defineConfig({
  site,
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  server: {
    port: 4322,
  },
});
