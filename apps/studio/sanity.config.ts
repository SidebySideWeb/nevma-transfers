import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemaTypes';
import { filterNewDocumentOptions, singletonActions, singletonTypes, structure } from './structure';

// A placeholder project id lets `schema validate` and `build` run before the real project exists.
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'tempproject';
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineConfig({
  name: 'tem-protection',
  title: 'TEM Protection',
  projectId,
  dataset,
  plugins: [structureTool({ structure }), visionTool()],
  schema: {
    types: schemaTypes,
    templates: (templates) => templates.filter(({ schemaType }) => !singletonTypes.has(schemaType)),
  },
  document: {
    newDocumentOptions: (prev, context) => filterNewDocumentOptions(prev, context),
    actions: (input, context) =>
      singletonTypes.has(context.schemaType) ? input.filter(({ action }) => action && singletonActions.has(action)) : input,
  },
});
