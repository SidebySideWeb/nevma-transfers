import { createSanityClient, sanityConfigured } from './client';
import { DEMO_PAGES } from './demo-pages';
import { PAGE_BY_SLUG_QUERY } from './queries';
import type { SanityImage } from './image';
import { getV2SeedPage, pageHasV2Sections } from './v2-seed-pages';

/** V2 (and legacy) page sections. V2 fields vary by `_type`; block components read what they need. */
export type PageSection =
  | ({
      _type:
        | 'pageHero'
        | 'promiseStrip'
        | 'divisionCards'
        | 'fleetShowcase'
        | 'howItWorks'
        | 'onBoard'
        | 'quoteBlock'
        | 'ctaPanel'
        | 'fleetBrowser'
        | 'galleryMosaic'
        | 'priceTable'
        | 'includedList'
        | 'bookingOptions'
        | 'featuredRoute'
        | 'occasions'
        | 'faqList'
        | 'featureTrio'
        | 'serviceColumns'
        | 'escortFeature'
        | 'statsBar'
        | 'clientsBlock'
        | 'contactCards'
        | 'enquiryForm'
        | 'legalDocument';
      _key?: string;
      [key: string]: unknown;
    })
  | {
      _type: 'hero';
      _key?: string;
      heading: string;
      subheading?: string;
      ctaLabel?: string;
      ctaTarget?: 'book' | 'quote' | 'url';
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
      ctaTarget?: 'book' | 'quote' | 'url';
      ctaUrl?: string;
    }
  | {
      _type: 'faq';
      _key?: string;
      heading?: string;
      items: Array<{ question: string; answer: string; _key?: string }>;
    }
  | {
      _type: 'featureGrid';
      _key?: string;
      heading?: string;
      intro?: string;
      items: Array<{ title: string; text: string; link?: string; _key?: string }>;
    }
  | {
      _type: 'imageText';
      _key?: string;
      heading: string;
      body: Record<string, unknown>[];
      image?: SanityImage;
      imageSide?: 'left' | 'right';
      ctaLabel?: string;
      ctaTarget?: 'book' | 'quote' | 'url';
      ctaUrl?: string;
    }
  | {
      _type: 'steps';
      _key?: string;
      heading?: string;
      items: Array<{ title: string; text?: string; _key?: string }>;
    }
  | {
      _type: 'vehicleClassList';
      _key?: string;
      heading?: string;
      intro?: string;
    }
  | {
      _type: 'routeList';
      _key?: string;
      heading?: string;
      intro?: string;
      routes?: Array<{
        title: string;
        slug: string;
        fromZone: string;
        toZone: string;
        featured?: boolean | null;
        sortOrder?: number | null;
      }> | null;
    }
  | {
      _type: 'contactDetails';
      _key?: string;
      heading?: string;
      showHours?: boolean | null;
    }
  | {
      _type: 'formBlock';
      _key?: string;
      heading?: string;
      form?: {
        key?: string;
        title?: string;
        intro?: string | null;
        recipientEmail?: string;
        topics?: {
          key: string;
          label: string;
          recipientEmail?: string | null;
          _key?: string;
        }[] | null;
        submitLabel?: string | null;
        successTitle?: string | null;
        successMessage?: string | null;
      } | null;
    };

export type CmsPage = {
  kind: 'home' | 'legal' | 'standard' | 'template';
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
  const seeded = getV2SeedPage(slug);
  if (seeded && pageHasV2Sections(seeded)) {
    console.warn(`[sanity] Using V2 seed page "${slug}" (${reason}).`);
    return seeded;
  }
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
    if (
      !doc?.title ||
      !doc?.slug ||
      (doc.kind !== 'home' &&
        doc.kind !== 'legal' &&
        doc.kind !== 'standard' &&
        doc.kind !== 'template')
    ) {
      return demoOrThrow(slug, 'document not published or not found');
    }
    const seo = doc.seo
      ? {
          title: doc.seo.title ?? undefined,
          description: doc.seo.description ?? undefined,
          noindex: doc.seo.noindex ?? undefined,
          image: (doc.seo.image ?? undefined) as SanityImage | undefined,
        }
      : null;
    const page: CmsPage = {
      kind: doc.kind,
      title: doc.title,
      slug: doc.slug,
      sections: (doc.sections ?? []) as PageSection[],
      seo,
    };
    // Until V2-1 import is applied to the live dataset, prefer the V2 seed page.
    if (!pageHasV2Sections(page)) {
      const seeded = getV2SeedPage(slug);
      if (seeded && pageHasV2Sections(seeded)) {
        console.warn(`[sanity] Page "${slug}" has no V2 sections yet; using seed.`);
        return seeded;
      }
    }
    return page;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed';
    // Re-throw our own missing-page errors that have no DEMO fallback.
    if (msg.startsWith('Missing Sanity page') && !DEMO_PAGES[slug]) throw e;
    return demoOrThrow(slug, msg);
  }
}

export const LEGAL_SLUGS = ['privacy', 'cookies', 'terms', 'cancellation'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

/** Standard CMS pages with no dedicated Astro route (fleet/services keep theirs). */
export const STANDARD_SLUGS = [
  'vip-security',
  'about',
  'contact',
  'request-a-transfer',
] as const;
export type StandardSlug = (typeof STANDARD_SLUGS)[number];

const legalSet = new Set<string>(LEGAL_SLUGS);
for (const slug of STANDARD_SLUGS) {
  if (legalSet.has(slug)) {
    throw new Error(`Slug "${slug}" is in both LEGAL_SLUGS and STANDARD_SLUGS`);
  }
}
