import { createImageUrlBuilder } from '@sanity/image-url';
import type { SanityImage } from '../sanity/image';
import { v2ImageSrc } from './image-src';

/** 1×1 transparent GIF — occupies `--bg-image` so v2.css fallbacks are not fetched. */
const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';

type V2Image = (SanityImage & { _sanityAsset?: string | null }) | null | undefined;

function projectConfig() {
  const projectId = import.meta.env.SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID;
  const dataset = import.meta.env.SANITY_DATASET || process.env.SANITY_DATASET;
  if (!projectId || !dataset) return null;
  return { projectId, dataset };
}

function imageSource(image: SanityImage) {
  if (!image?.asset) return null;
  const ref = image.asset._ref || image.asset._id;
  if (!ref) return null;
  return { asset: { _ref: ref } };
}

/** Sanity CDN (with width) or seed/local fallback URL for a V2 photo. */
export function v2PhotoUrl(image: V2Image, width = 960): string | undefined {
  const b = projectConfig() ? createImageUrlBuilder(projectConfig()!) : null;
  const source = image ? imageSource(image) : null;
  if (b && source) {
    return b.image(source).width(width).auto('format').quality(70).url() || undefined;
  }
  const raw = image?.asset?.url || undefined;
  if (raw) {
    // Already a CDN URL without params — add width when possible.
    if (/cdn\.sanity\.io/.test(raw) && !/[?&]w=/.test(raw)) {
      return `${raw}${raw.includes('?') ? '&' : '?'}w=${width}&auto=format&q=70`;
    }
    return raw;
  }
  if (image) {
    const fallback = v2ImageSrc(image, '');
    return fallback || undefined;
  }
  return undefined;
}

/** CSS custom property for V2 background photos: `--bg-image:url(...)`. Eager (hero). */
export function bgImage(image: V2Image, width = 960): string | undefined {
  const url = v2PhotoUrl(image, width);
  if (!url) return undefined;
  return `--bg-image:url(${url})`;
}

/**
 * Below-fold backgrounds: placeholder `--bg-image` so CSS fallbacks stay idle, plus
 * `data-bg-image` for the real URL (hydrated by PublicLayout's IntersectionObserver).
 * Pass `cssFallback` when the seed has no image but `v2.css` would otherwise fetch one.
 */
export function bgImageLazy(
  image: V2Image,
  width = 960,
  cssFallback?: string,
): {
  style: string;
  'data-bg-image': string;
} | undefined {
  const url = v2PhotoUrl(image, width) || cssFallback;
  if (!url) return undefined;
  return {
    style: `--bg-image:url(${PLACEHOLDER})`,
    'data-bg-image': url,
  };
}
