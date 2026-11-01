/** Resolve a Sanity image (live asset or seed `_sanityAsset`) to a URL. */
export function v2ImageSrc(
  image: {
    url?: string | null;
    asset?: { url?: string | null } | null;
    _sanityAsset?: string | null;
  } | null | undefined,
  fallback: string,
): string {
  const fromAsset = image?.asset?.url || image?.url;
  if (fromAsset) return fromAsset;
  const raw = image?._sanityAsset;
  if (typeof raw === 'string') {
    const m = raw.match(/\/images\/([^"'?\s]+)/);
    if (m?.[1]) return `/images/v2/${m[1]}`;
  }
  return fallback;
}
