import type { SiteSettings } from './sanity/content';
import { ogImageUrl, type SanityImage } from './sanity/image';

export type SeoFields = {
  title?: string | null;
  description?: string | null;
  noindex?: boolean | null;
  image?: SanityImage;
} | null;

export type ResolvedSeo = {
  title: string;
  description: string;
  robots: string;
  canonical: string;
  ogImage?: string;
  twitterCard: 'summary_large_image' | 'summary';
};

/** Title template: "<page> · TEM Protection". */
export function pageTitle(pageTitleText: string, companyName = 'TEM Protection'): string {
  const page = pageTitleText.trim();
  if (!page) return companyName;
  if (page.includes(companyName)) return page;
  return `${page} · ${companyName}`;
}

export function resolveSeo(opts: {
  pageTitle: string;
  pageSeo: SeoFields;
  settings: SiteSettings;
  pathname: string;
  siteUrl: string;
}): ResolvedSeo {
  const { pageSeo, settings, pathname, siteUrl } = opts;
  const defaultSeo = settings.defaultSeo;
  const titleSource = pageSeo?.title || defaultSeo?.title || opts.pageTitle || settings.companyName;
  const title = pageTitle(titleSource, settings.companyName);
  const description =
    pageSeo?.description ||
    defaultSeo?.description ||
    settings.tagline ||
    '';
  const noindex = Boolean(pageSeo?.noindex ?? defaultSeo?.noindex);
  const image =
    ogImageUrl(pageSeo?.image ?? null) ||
    ogImageUrl(defaultSeo?.image ?? null) ||
    settings.logo?.asset?.url ||
    undefined;
  const base = siteUrl.replace(/\/$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return {
    title,
    description,
    robots: noindex ? 'noindex,nofollow' : 'index,follow',
    canonical: `${base}${path === '/' ? '/' : path.replace(/\/$/, '')}`,
    ogImage: image,
    twitterCard: image ? 'summary_large_image' : 'summary',
  };
}

export type FaqItem = { question: string; answer: string };

export function organizationJsonLd(
  settings: SiteSettings,
  siteUrl: string,
  opts?: { contactPoint?: boolean },
) {
  const url = siteUrl.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.companyName,
    url,
    ...(settings.logo?.asset?.url ? { logo: settings.logo.asset.url } : {}),
    ...(settings.phone ? { telephone: settings.phone } : {}),
    ...(settings.email ? { email: settings.email } : {}),
    ...(settings.address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: settings.address,
          },
        }
      : {}),
    ...(opts?.contactPoint
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            ...(settings.phone ? { telephone: settings.phone } : {}),
            ...(settings.email ? { email: settings.email } : {}),
            contactType: 'customer service',
            availableLanguage: 'English',
          },
        }
      : {}),
  };
}

export function faqPageJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function ctaHref(target?: string | null, url?: string | null): string {
  if (target === 'book') return '/book';
  if (target === 'quote') return '/request-a-transfer';
  if (target === 'url' && url) return url;
  return '/book';
}

/** Section `_type` values supported by `Sections.astro`. */
export const SECTION_TYPES = [
  'hero',
  'richText',
  'ctaBand',
  'faq',
  'featureGrid',
  'imageText',
  'steps',
  'vehicleClassList',
  'routeList',
  'contactDetails',
  'formBlock',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export function breadcrumbJsonLd(
  items: { name: string; item?: string }[],
  siteUrl: string,
) {
  const base = siteUrl.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      ...(entry.item
        ? { item: entry.item.startsWith('http') ? entry.item : `${base}${entry.item}` }
        : {}),
    })),
  };
}

export function serviceJsonLd(opts: {
  name: string;
  description?: string;
  url: string;
  providerName: string;
  lowPriceCents?: number | null;
  /** Exact prices (one Offer each). Used on route pages. */
  offerPricesCents?: number[];
  showPrice: boolean;
}) {
  let offers: Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (opts.showPrice && opts.offerPricesCents && opts.offerPricesCents.length > 0) {
    offers = opts.offerPricesCents.map((cents) => ({
      '@type': 'Offer',
      priceCurrency: 'EUR',
      price: (cents / 100).toFixed(2),
    }));
  } else if (opts.showPrice && opts.lowPriceCents != null) {
    offers = {
      '@type': 'Offer',
      priceCurrency: 'EUR',
      lowPrice: (opts.lowPriceCents / 100).toFixed(2),
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    url: opts.url,
    provider: {
      '@type': 'Organization',
      name: opts.providerName,
    },
    areaServed: 'Athens',
    ...(offers ? { offers } : {}),
  };
}

export function sectionTypesInOrder(
  sections: Array<{ _type?: string } | null | undefined>,
): SectionType[] {
  return sections
    .map((s) => s?._type)
    .filter((t): t is SectionType => SECTION_TYPES.includes(t as SectionType));
}
