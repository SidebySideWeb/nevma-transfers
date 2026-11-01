import { describe, expect, it } from 'vitest';
import {
  ctaHref,
  faqPageJsonLd,
  organizationJsonLd,
  pageTitle,
  resolveSeo,
  sectionTypesInOrder,
} from './seo';
import type { SiteSettings } from './sanity/content';
import type { PageSection } from './sanity/pages';

const settings: SiteSettings = {
  companyName: 'TEM Protection',
  phone: '+30 210 000 0000',
  email: 'hello@example.com',
  bookingNotificationEmail: 'office@example.com',
  address: 'DEMO address, Athens, Greece',
  tagline: 'Premium transfers',
  logo: { alt: 'Logo', asset: { url: 'https://cdn.sanity.io/images/x/y/logo.png' } },
  defaultSeo: {
    title: 'Default SEO',
    description: 'Default description',
  },
};

describe('pageTitle', () => {
  it('applies the TEM Protection template', () => {
    expect(pageTitle('Privacy policy')).toBe('Privacy policy · TEM Protection');
  });
});

describe('resolveSeo', () => {
  it('falls back to siteSettings.defaultSeo and respects noindex', () => {
    const seo = resolveSeo({
      pageTitle: 'Home',
      pageSeo: { noindex: true },
      settings,
      pathname: '/',
      siteUrl: 'https://example.com',
    });
    expect(seo.title).toBe('Default SEO · TEM Protection');
    expect(seo.description).toBe('Default description');
    expect(seo.robots).toBe('noindex,nofollow');
    expect(seo.canonical).toBe('https://example.com/');
  });
});

describe('JSON-LD', () => {
  it('organizationJsonLd matches the expected shape', () => {
    const ld = organizationJsonLd(settings, 'https://tem.example');
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'TEM Protection',
      url: 'https://tem.example',
      telephone: '+30 210 000 0000',
      email: 'hello@example.com',
      logo: 'https://cdn.sanity.io/images/x/y/logo.png',
      address: { '@type': 'PostalAddress', streetAddress: 'DEMO address, Athens, Greece' },
    });
  });

  it('faqPageJsonLd matches the expected shape', () => {
    const ld = faqPageJsonLd([
      { question: 'DEMO How is the price set?', answer: 'DEMO Fixed prices.' },
    ]);
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'DEMO How is the price set?',
          acceptedAnswer: { '@type': 'Answer', text: 'DEMO Fixed prices.' },
        },
      ],
    });
  });
});

describe('sectionTypesInOrder / ctaHref', () => {
  it('lists each section type from a fixture in order', () => {
    const sections: PageSection[] = [
      { _type: 'hero', heading: 'H', ctaTarget: 'book' },
      { _type: 'richText', body: [] },
      {
        _type: 'faq',
        items: [{ question: 'Q', answer: 'A' }],
      },
      { _type: 'ctaBand', heading: 'C', ctaLabel: 'Go', ctaTarget: 'book' },
    ];
    expect(sectionTypesInOrder(sections)).toEqual(['hero', 'richText', 'faq', 'ctaBand']);
  });

  it('maps ctaTarget book/quote/url', () => {
    expect(ctaHref('book')).toBe('/book');
    expect(ctaHref('quote')).toBe('/request-a-transfer');
    expect(ctaHref('url', 'https://example.com')).toBe('https://example.com');
  });
});
