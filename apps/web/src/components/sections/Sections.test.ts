import { describe, expect, it } from 'vitest';
import type { PageSection } from '../../lib/sanity/pages';
import { DEMO_PAGES } from '../../lib/sanity/demo-pages';
import { ctaHref, sectionTypesInOrder } from '../../lib/seo';

/** Minimal stand-in for `Sections.astro` switch: maps `_type` → rendered kind. */
function renderSectionKinds(sections: PageSection[]): string[] {
  return sections.map((section) => {
    switch (section._type) {
      case 'hero':
        return `hero:${section.heading}:${ctaHref(section.ctaTarget, section.ctaUrl)}`;
      case 'richText':
        return `richText:${section.heading ?? ''}:${section.body.length}`;
      case 'ctaBand':
        return `ctaBand:${section.heading}:${ctaHref(section.ctaTarget, section.ctaUrl)}`;
      case 'faq':
        return `faq:${section.heading ?? ''}:${section.items.length}`;
      case 'featureGrid':
        return `featureGrid:${section.heading ?? ''}:${section.items.length}`;
      case 'imageText':
        return `imageText:${section.heading}:${section.imageSide ?? 'right'}:${ctaHref(section.ctaTarget, section.ctaUrl)}`;
      case 'steps':
        return `steps:${section.heading ?? ''}:${section.items.length}`;
      case 'vehicleClassList':
        return `vehicleClassList:${section.heading ?? ''}`;
      case 'routeList':
        return `routeList:${section.heading ?? ''}:${section.routes?.length ?? 0}`;
      case 'contactDetails':
        return `contactDetails:${section.heading ?? ''}:${section.showHours ? 'hours' : 'no-hours'}`;
      case 'formBlock':
        return `formBlock:${section.heading ?? section.form?.title ?? ''}`;
      case 'pageHero':
      case 'promiseStrip':
      case 'divisionCards':
      case 'fleetShowcase':
      case 'howItWorks':
      case 'onBoard':
      case 'quoteBlock':
      case 'ctaPanel':
      case 'fleetBrowser':
      case 'galleryMosaic':
      case 'priceTable':
      case 'includedList':
      case 'bookingOptions':
      case 'featuredRoute':
      case 'occasions':
      case 'faqList':
      case 'featureTrio':
      case 'serviceColumns':
      case 'escortFeature':
      case 'statsBar':
      case 'clientsBlock':
      case 'contactCards':
      case 'enquiryForm':
      case 'legalDocument':
        return section._type;
      default:
        return 'unknown';
    }
  });
}

const kitchenSinkFixture: PageSection[] = [
  {
    _type: 'hero',
    heading: 'DEMO Kitchen sink hero',
    subheading: 'DEMO all section types',
    ctaLabel: 'Book now',
    ctaTarget: 'book',
  },
  {
    _type: 'richText',
    heading: 'DEMO Rich text',
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'DEMO body', marks: [] }],
      },
    ],
  },
  {
    _type: 'featureGrid',
    heading: 'DEMO Features',
    items: [
      { title: 'DEMO A', text: 'DEMO text A', link: '/book' },
      { title: 'DEMO B', text: 'DEMO text B' },
    ],
  },
  {
    _type: 'imageText',
    heading: 'DEMO Image text',
    body: [
      {
        _type: 'block',
        _key: 'b2',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: 's2', text: 'DEMO copy', marks: [] }],
      },
    ],
    imageSide: 'left',
    ctaLabel: 'Request a quote',
    ctaTarget: 'quote',
  },
  {
    _type: 'steps',
    heading: 'DEMO Steps',
    items: [
      { title: 'DEMO One', text: 'First' },
      { title: 'DEMO Two', text: 'Second' },
    ],
  },
  {
    _type: 'vehicleClassList',
    heading: 'DEMO Fleet list',
    intro: 'DEMO intro',
  },
  {
    _type: 'routeList',
    heading: 'DEMO Routes',
    routes: [],
  },
  {
    _type: 'contactDetails',
    heading: 'DEMO Contact',
    showHours: true,
  },
  {
    _type: 'formBlock',
    heading: 'DEMO Form',
    form: { key: 'contact', title: 'Contact us', intro: 'DEMO intro' },
  },
  {
    _type: 'faq',
    heading: 'DEMO FAQ',
    items: [{ question: 'DEMO Q?', answer: 'DEMO A' }],
  },
  {
    _type: 'ctaBand',
    heading: 'DEMO CTA',
    text: 'DEMO text',
    ctaLabel: 'Book now',
    ctaTarget: 'book',
  },
];

describe('Sections', () => {
  it('renders each kit 1 section type from the home fixture', () => {
    const fixture = DEMO_PAGES.home!.sections;
    expect(sectionTypesInOrder(fixture)).toEqual(['hero', 'richText', 'faq', 'ctaBand']);
    const rendered = renderSectionKinds(fixture);
    expect(rendered[0]).toContain('hero:DEMO Arrive');
    expect(rendered[0]).toContain('/book');
    expect(rendered[1]).toMatch(/^richText:/);
    expect(rendered[2]).toMatch(/^faq:.*:2$/);
    expect(rendered[3]).toContain('ctaBand:DEMO Ready');
  });

  it('renders every kit 2 section type in order from a kitchen-sink fixture', () => {
    expect(sectionTypesInOrder(kitchenSinkFixture)).toEqual([
      'hero',
      'richText',
      'featureGrid',
      'imageText',
      'steps',
      'vehicleClassList',
      'routeList',
      'contactDetails',
      'formBlock',
      'faq',
      'ctaBand',
    ]);
    const rendered = renderSectionKinds(kitchenSinkFixture);
    expect(rendered).toEqual([
      'hero:DEMO Kitchen sink hero:/book',
      'richText:DEMO Rich text:1',
      'featureGrid:DEMO Features:2',
      'imageText:DEMO Image text:left:/request-a-transfer',
      'steps:DEMO Steps:2',
      'vehicleClassList:DEMO Fleet list',
      'routeList:DEMO Routes:0',
      'contactDetails:DEMO Contact:hours',
      'formBlock:DEMO Form',
      'faq:DEMO FAQ:1',
      'ctaBand:DEMO CTA:/book',
    ]);
  });
});
