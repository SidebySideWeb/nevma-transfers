import { defineCliConfig } from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'tempproject',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  typegen: {
    path: '../web/src/**/*.{ts,tsx,astro}',
    schema: 'schema.json',
    generates: '../web/src/sanity/sanity.types.ts',
  },
});
