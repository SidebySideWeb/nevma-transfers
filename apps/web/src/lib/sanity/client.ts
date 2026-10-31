import { createClient } from '@sanity/client';

/**
 * Server/build Sanity client. Dataset is private — token required.
 * Never import this into a browser island.
 */
export function createSanityClient() {
  const projectId = import.meta.env.SANITY_PROJECT_ID;
  const dataset = import.meta.env.SANITY_DATASET;
  const token = import.meta.env.SANITY_READ_TOKEN;

  if (!projectId || !dataset) {
    throw new Error('SANITY_PROJECT_ID and SANITY_DATASET are required');
  }

  return createClient({
    projectId,
    dataset,
    apiVersion: '2026-10-01',
    useCdn: false,
    perspective: 'published',
    token,
  });
}
