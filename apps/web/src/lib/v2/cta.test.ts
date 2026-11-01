import { describe, expect, it } from 'vitest';
import { resolveCtaHref, resolveCtaLabel } from './cta';

describe('CtaLink targets', () => {
  it('resolves every target', () => {
    expect(resolveCtaHref({ target: 'book' })).toBe('/book');
    expect(resolveCtaHref({ target: 'quote' })).toBe('/request-a-transfer');
    expect(resolveCtaHref({ target: 'fleet' })).toBe('/fleet');
    expect(resolveCtaHref({ target: 'services' })).toBe('/services');
    expect(resolveCtaHref({ target: 'vipSecurity' })).toBe('/vip-security');
    expect(resolveCtaHref({ target: 'about' })).toBe('/about');
    expect(resolveCtaHref({ target: 'contact' })).toBe('/contact');
    expect(resolveCtaHref({ target: 'findBooking' })).toBe('/booking/find');
    expect(resolveCtaHref({ target: 'phone' }, '+30 210 970 6967')).toBe('tel:+302109706967');
    expect(resolveCtaHref({ target: 'url', url: '/about#clients' })).toBe('/about#clients');
  });

  it('fills {phone} in the label', () => {
    expect(resolveCtaLabel({ label: 'Call {phone}', target: 'phone' }, '+30 210 970 6967')).toBe(
      'Call +30 210 970 6967',
    );
  });
});
