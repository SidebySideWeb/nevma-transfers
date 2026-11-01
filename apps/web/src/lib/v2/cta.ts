export type CtaTarget =
  | 'book'
  | 'quote'
  | 'fleet'
  | 'services'
  | 'vipSecurity'
  | 'about'
  | 'contact'
  | 'findBooking'
  | 'phone'
  | 'url';

export type CtaLinkData = {
  label?: string | null;
  target?: CtaTarget | string | null;
  url?: string | null;
};

const PATHS: Record<Exclude<CtaTarget, 'phone' | 'url'>, string> = {
  book: '/book',
  quote: '/request-a-transfer',
  fleet: '/fleet',
  services: '/services',
  vipSecurity: '/vip-security',
  about: '/about',
  contact: '/contact',
  findBooking: '/booking/find',
};

/** Resolve a Sanity ctaLink to an href. Phone uses siteSettings.phone. */
export function resolveCtaHref(
  link: CtaLinkData | null | undefined,
  phone?: string | null,
): string {
  const target = (link?.target || 'book') as CtaTarget;
  if (target === 'phone') {
    const digits = (phone || '').replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : '#';
  }
  if (target === 'url') return link?.url || '#';
  return PATHS[target as Exclude<CtaTarget, 'phone' | 'url'>] || link?.url || '#';
}

export function resolveCtaLabel(
  link: CtaLinkData | null | undefined,
  phone?: string | null,
): string {
  const label = link?.label || '';
  if (!phone) return label;
  return label.replaceAll('{phone}', phone);
}
