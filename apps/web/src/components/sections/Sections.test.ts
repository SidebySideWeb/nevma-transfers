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
      default:
        return 'unknown';
    }
  });
}

describe('Sections', () => {
  it('renders each section type from a fixture', () => {
    const fixture = DEMO_PAGES.home!.sections;
    expect(sectionTypesInOrder(fixture)).toEqual(['hero', 'richText', 'faq', 'ctaBand']);
    const rendered = renderSectionKinds(fixture);
    expect(rendered[0]).toContain('hero:DEMO Arrive');
    expect(rendered[0]).toContain('/book');
    expect(rendered[1]).toMatch(/^richText:/);
    expect(rendered[2]).toMatch(/^faq:.*:2$/);
    expect(rendered[3]).toContain('ctaBand:DEMO Ready');
  });
});
