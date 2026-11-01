import { createImageUrlBuilder } from '@sanity/image-url';
import type { SanityImage } from '../sanity/image';

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

/** CSS custom property for V2 background photos: `--bg-image:url(...)`. */
export function bgImage(image: SanityImage, width = 1600): string | undefined {
  const b = projectConfig() ? createImageUrlBuilder(projectConfig()!) : null;
  const source = imageSource(image);
  let url: string | undefined;
  if (b && source) {
    url = b.image(source).width(width).auto('format').quality(75).url();
  } else {
    url = image?.asset?.url || undefined;
  }
  if (!url) return undefined;
  return `--bg-image:url(${url})`;
}
