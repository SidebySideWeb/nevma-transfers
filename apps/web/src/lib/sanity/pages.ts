import { createSanityClient, sanityConfigured } from './client';
import { DEMO_PAGES } from './demo-pages';
import { PAGE_BY_SLUG_QUERY } from './queries';
import type { SanityImage } from './image';

export type PageSection =
  | {
      _type: 'hero';
      _key?: string;
      heading: string;
      subheading?: string;
      ctaLabel?: string;
      ctaTarget?: 'book' | 'url';
      ctaUrl?: string;
      image?: SanityImage;
    }
  | {
      _type: 'richText';
      _key?: string;
      heading?: string;
      body: Record<string, unknown>[];
    }
  | {
      _type: 'ctaBand';
      _key?: string;
      heading: string;
      text?: string;
      ctaLabel: string;
      ctaTarget?: 'book' | 'url';
      ctaUrl?: string;
    }
  | {
      _type: 'faq';
      _key?: string;
      heading?: string;
      items: Array<{ question: string; answer: string; _key?: string }>;
    };

export type CmsPage = {
  kind: 'home' | 'legal';
  title: string;
  slug: string;
  sections: PageSection[];
  seo?: {
    title?: string;
    description?: string;
    noindex?: boolean;
    image?: SanityImage;
  } | null;
};

function demoOrThrow(slug: string, reason: string): CmsPage {
  const demo = DEMO_PAGES[slug];
  if (demo) {
    console.warn(`[sanity] Using DEMO page "${slug}" (${reason}).`);
    return demo;
  }
  throw new Error(
    `Missing Sanity page for slug "${slug}" (${reason}). Create and publish document page-${slug}, or remove Sanity env vars to use DEMO fixtures.`,
  );
}

/** Fetch a page by slug. Falls back to DEMO fixtures when Sanity is unset, unreachable, or empty. */
export async function getPageBySlug(slug: string): Promise<CmsPage> {
  if (!sanityConfigured()) {
    return demoOrThrow(slug, 'Sanity env not configured');
  }

  try {
    const client = createSanityClient();
    const doc = await client.fetch(PAGE_BY_SLUG_QUERY, { slug });
    if (!doc?.title || !doc?.slug) {
      return demoOrThrow(slug, 'document not published or not found');
    }
    return {
      kind: doc.kind,
      title: doc.title,
      slug: doc.slug,
      sections: (doc.sections ?? []) as PageSection[],
      seo: doc.seo ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed';
    // Re-throw our own missing-page errors that have no DEMO fallback.
    if (msg.startsWith('Missing Sanity page') && !DEMO_PAGES[slug]) throw e;
    return demoOrThrow(slug, msg);
  }
}

export const LEGAL_SLUGS = ['privacy', 'cookies', 'terms', 'cancellation'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
