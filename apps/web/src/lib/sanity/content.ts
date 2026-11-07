import { createSanityClient, sanityConfigured } from './client';
import type { SanityImage } from './image';
import { SITE_SETTINGS_QUERY, UI_STRINGS_QUERY } from './queries';
import { setStringOverrides, type UiStringKey } from '../strings';
import { seedUiStringOverrides } from './v2-seed-strings';

export type SiteWhatsapp = {
  enabled?: boolean | null;
  label?: string | null;
  greeting?: string | null;
  showFloatingButton?: boolean | null;
};

export type SiteSettings = {
  companyName: string;
  tagline?: string;
  phone: string;
  mobilePhone?: string;
  email: string;
  bookingNotificationEmail: string;
  address?: string;
  openingHours?: string;
  timezone?: string;
  showFromPrices?: boolean | null;
  defaultSeo?: {
    title?: string;
    description?: string;
    noindex?: boolean;
    image?: SanityImage;
  } | null;
  logo?: SanityImage;
  whatsapp?: SiteWhatsapp | null;
  internalNote?: string;
};

const FALLBACK_SETTINGS: SiteSettings = {
  companyName: 'Elite Protection',
  phone: '+30 210 970 6967',
  mobilePhone: '+30 698 181 0410',
  email: 'info@eliteprotection.gr',
  bookingNotificationEmail: 'office@example.com',
  address: '[Office address, Athens]',
  openingHours: 'DEMO: every day, 24 hours',
  timezone: 'Europe/Athens',
  showFromPrices: true,
  defaultSeo: {
    title: 'Elite Protection (DEMO)',
    description: 'DEMO description: premium transfers and VIP security in Athens. Book online.',
  },
  whatsapp: {
    enabled: true,
    label: 'WhatsApp',
    greeting: null,
    showFloatingButton: true,
  },
};

let settingsCache: { value: SiteSettings; expiresAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function loadUiStrings(): Promise<void> {
  // Prefer the V2 seed strings so the site matches the design before `import:v2` is applied.
  const overrides: Partial<Record<UiStringKey, string>> = { ...seedUiStringOverrides() };
  if (sanityConfigured()) {
    try {
      const client = createSanityClient();
      const doc = await client.fetch(UI_STRINGS_QUERY);
      for (const row of doc?.strings ?? []) {
        if (row?.key && typeof row.value === 'string' && !(row.key in overrides)) {
          overrides[row.key as UiStringKey] = row.value;
        }
      }
    } catch {
      // Keep seed / code defaults when Sanity is unreachable.
    }
  }
  if (Object.keys(overrides).length > 0) setStringOverrides(overrides);
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (settingsCache && Date.now() < settingsCache.expiresAt) {
    return settingsCache.value;
  }
  if (!sanityConfigured()) {
    return FALLBACK_SETTINGS;
  }
  try {
    const client = createSanityClient();
    const doc = await client.fetch(SITE_SETTINGS_QUERY);
    if (!doc?.companyName || !doc.phone || !doc.email) {
      return FALLBACK_SETTINGS;
    }
    const value = { ...(doc as SiteSettings) };
    // Prefer the V2 seed address while the live dataset still has a DEMO placeholder.
    if (!value.address || /demo/i.test(value.address)) {
      value.address = '[Office address, Athens]';
    }
    settingsCache = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  } catch {
    return FALLBACK_SETTINGS;
  }
}
