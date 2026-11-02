import { describe, expect, it } from 'vitest';
import { LEGAL_SLUGS } from '../sanity/pages';

/** Same mapping as `pages/[legal].astro` (301). */
function legalRedirect(slug: string): string {
  return `/legal#${slug}`;
}

describe('legal redirects (V2-5)', () => {
  it('301 targets for terms, cancellation, privacy, cookies', () => {
    expect(LEGAL_SLUGS).toEqual(['privacy', 'cookies', 'terms', 'cancellation']);
    for (const slug of LEGAL_SLUGS) {
      expect(legalRedirect(slug)).toBe(`/legal#${slug}`);
    }
  });
});
