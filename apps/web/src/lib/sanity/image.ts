import { createImageUrlBuilder } from '@sanity/image-url';

export type SanityImage = {
  alt?: string;
  asset?: {
    _id?: string;
    _ref?: string;
    url?: string;
    metadata?: { dimensions?: { width?: number; height?: number } } | null;
  } | null;
} | null;

const SRCSET_WIDTHS = [480, 768, 1200, 1600] as const;

function projectConfig() {
  const projectId = import.meta.env.SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID;
  const dataset = import.meta.env.SANITY_DATASET || process.env.SANITY_DATASET;
  if (!projectId || !dataset) return null;
  return { projectId, dataset };
}

function builder() {
  const cfg = projectConfig();
  if (!cfg) return null;
  return createImageUrlBuilder(cfg);
}

function imageSource(image: SanityImage) {
  if (!image?.asset) return null;
  const ref = image.asset._ref || image.asset._id;
  if (!ref) return null;
  return { asset: { _ref: ref } };
}

export type ResponsiveImage = {
  src: string;
  srcset: string;
  width: number;
  height: number;
  alt: string;
};

/** Sanity CDN URLs with width, auto=format, fit=max, and srcset. */
export function responsiveImage(
  image: SanityImage,
  opts: { fallbackWidth?: number; fallbackHeight?: number } = {},
): ResponsiveImage | null {
  const alt = image?.alt?.trim() || '';
  const dims = image?.asset?.metadata?.dimensions;
  const naturalW = dims?.width || opts.fallbackWidth || 1600;
  const naturalH = dims?.height || opts.fallbackHeight || 1000;
  const b = builder();
  const source = imageSource(image);

  if (b && source) {
    const base = b.image(source).auto('format').fit('max').quality(70);
    const src = base.width(768).url();
    const srcset = SRCSET_WIDTHS.map((w) => `${base.width(w).url()} ${w}w`).join(', ');
    return { src, srcset, width: naturalW, height: naturalH, alt };
  }

  const raw = image?.asset?.url;
  if (!raw) return null;
  return { src: raw, srcset: `${raw} 1200w`, width: naturalW, height: naturalH, alt };
}

export function ogImageUrl(image: SanityImage): string | undefined {
  const b = builder();
  const source = imageSource(image);
  if (b && source) {
    return b.image(source).width(1200).height(630).fit('crop').auto('format').url();
  }
  return image?.asset?.url || undefined;
}
