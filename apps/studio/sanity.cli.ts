import { defineCliConfig } from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'tempproject',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  deployment: {
    appId: 'm4t158ia38n3h648lg0a2fjs',
  },
  typegen: {
    path: '../web/src/**/*.{ts,tsx,astro}',
    schema: 'schema.json',
    generates: '../web/src/sanity/sanity.types.ts',
  },
});
