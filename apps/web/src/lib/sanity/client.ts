import { createClient, type SanityClient } from '@sanity/client';

function env(name: string): string {
  const fromProcess =
    typeof process !== 'undefined' ? process.env[name] : undefined;
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[name];
  return (fromProcess || fromMeta || '').trim();
}

/**
 * Server/build Sanity client. Dataset is private — token required.
 * Never import this into a browser island.
 */
export function createSanityClient(): SanityClient {
  const projectId = env('SANITY_PROJECT_ID');
  const dataset = env('SANITY_DATASET');
  const token = env('SANITY_READ_TOKEN');

  if (!projectId || !dataset) {
    throw new Error('SANITY_PROJECT_ID and SANITY_DATASET are required');
  }
  if (!token) {
    throw new Error('SANITY_READ_TOKEN is required for the private dataset');
  }

  return createClient({
    projectId,
    dataset,
    apiVersion: '2026-10-01',
    useCdn: false,
    perspective: 'published',
    token,
    // Build/prerender runs in Node — never assume a browser runtime.
    ignoreBrowserTokenWarning: true,
  });
}

export function sanityConfigured(): boolean {
  return Boolean(env('SANITY_PROJECT_ID') && env('SANITY_DATASET') && env('SANITY_READ_TOKEN'));
}
