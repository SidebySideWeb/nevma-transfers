import { features, whatsappUrl } from '@tem/features';
import type { SiteSettings } from './sanity/content';

/** Resolved WhatsApp chrome for the public site (null when the switch is off or Sanity disabled it). */
export type SiteWhatsappChrome = {
  href: string;
  label: string;
  showFloatingButton: boolean;
};

export function siteWhatsappChrome(
  settings: SiteSettings,
  opts: { ref?: string | null; pickupAt?: string | Date | null } = {},
): SiteWhatsappChrome | null {
  const f = features();
  if (!f.whatsapp || !f.whatsappNumber) return null;
  const wa = settings.whatsapp;
  if (wa && wa.enabled === false) return null;
  const greeting = wa?.greeting?.trim() || undefined;
  const href = whatsappUrl({
    number: f.whatsappNumber,
    ref: opts.ref,
    pickupAt: opts.pickupAt,
    text: opts.ref ? undefined : greeting,
  });
  if (!href) return null;
  return {
    href,
    label: (wa?.label && wa.label.trim()) || 'WhatsApp',
    showFloatingButton: wa?.showFloatingButton !== false,
  };
}
