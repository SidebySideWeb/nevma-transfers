import { createSanityClient } from './client';
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

function canQuery(): boolean {
  return Boolean(
    import.meta.env.SANITY_PROJECT_ID &&
      import.meta.env.SANITY_DATASET &&
      import.meta.env.SANITY_READ_TOKEN,
  );
}

/** Fetch a page by slug. Throws with a clear message when the document is missing. */
export async function getPageBySlug(slug: string): Promise<CmsPage> {
  if (!canQuery()) {
    const demo = DEMO_PAGES[slug];
    if (demo) return demo;
    throw new Error(
      `Sanity is not configured and there is no DEMO fixture for slug "${slug}". Set SANITY_PROJECT_ID, SANITY_DATASET and SANITY_READ_TOKEN.`,
    );
  }
  const client = createSanityClient();
  const doc = await client.fetch(PAGE_BY_SLUG_QUERY, { slug });
  if (!doc?.title || !doc?.slug) {
    throw new Error(
      `Missing Sanity page for slug "${slug}". Create and publish document page-${slug} (type page) before building.`,
    );
  }
  return {
    kind: doc.kind,
    title: doc.title,
    slug: doc.slug,
    sections: (doc.sections ?? []) as PageSection[],
    seo: doc.seo ?? null,
  };
}

export const LEGAL_SLUGS = ['privacy', 'cookies', 'terms', 'cancellation'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
