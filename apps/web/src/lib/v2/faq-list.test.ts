import { describe, expect, it } from 'vitest';
import { faqAfterToggle, faqExpandedAt, faqToggleSign } from './faq-list';

describe('faq toggle and ARIA (V2-5)', () => {
  it('opens the first item by default', () => {
    expect(faqExpandedAt(0)).toBe(true);
    expect(faqExpandedAt(1)).toBe(false);
    expect(faqToggleSign(true)).toBe('−');
    expect(faqToggleSign(false)).toBe('+');
  });

  it('toggles accordion open state', () => {
    expect(faqAfterToggle(0, 0)).toBe(null);
    expect(faqAfterToggle(0, 2)).toBe(2);
    expect(faqAfterToggle(null, 1)).toBe(1);
  });
});
