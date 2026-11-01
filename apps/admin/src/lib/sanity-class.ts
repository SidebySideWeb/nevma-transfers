/** Server-side Sanity lookup for a vehicle class (read token only). */

export type SanityClassDoc = {
  _id: string;
  name: string | null;
  photos: number;
  _updatedAt: string | null;
};

export function studioBaseUrl(): string {
  return (
    import.meta.env.PUBLIC_SANITY_STUDIO_URL ||
    process.env.PUBLIC_SANITY_STUDIO_URL ||
    import.meta.env.PUBLIC_STUDIO_URL ||
    process.env.PUBLIC_STUDIO_URL ||
    ''
  ).replace(/\/$/, '');
}

export function studioEditClassUrl(id: string): string | null {
  const base = studioBaseUrl();
  if (!base) return null;
  return `${base}/intent/edit/id=${encodeURIComponent(id)};type=vehicleClass`;
}

export function studioCreateClassUrl(key: string): string | null {
  const base = studioBaseUrl();
  if (!base) return null;
  // Prefill key via template params when the Studio supports it.
  return `${base}/intent/create/template=vehicleClass;key=${encodeURIComponent(key)}`;
}

export async function fetchSanityClass(key: string): Promise<SanityClassDoc | null> {
  const projectId = import.meta.env.SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID;
  const dataset = import.meta.env.SANITY_DATASET || process.env.SANITY_DATASET;
  const token = import.meta.env.SANITY_READ_TOKEN || process.env.SANITY_READ_TOKEN;
  if (!projectId || !dataset) return null;
  try {
    const { createClient } = await import('@sanity/client');
    const client = createClient({
      projectId,
      dataset,
      apiVersion: '2025-01-01',
      useCdn: false,
      token: token || undefined,
    });
    const row = await client.fetch<SanityClassDoc | null>(
      `*[_type == "vehicleClass" && key == $key][0]{_id, name, "photos": count(gallery), _updatedAt}`,
      { key },
    );
    return row ?? null;
  } catch {
    return null;
  }
}
