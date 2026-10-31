import { createSanityClient } from './client';
import type { SanityImage } from './image';
import { SITE_SETTINGS_QUERY, UI_STRINGS_QUERY } from './queries';
import { setStringOverrides, type UiStringKey } from '../strings';

export type SiteSettings = {
  companyName: string;
  tagline?: string;
  phone: string;
  email: string;
  bookingNotificationEmail: string;
  address?: string;
  openingHours?: string;
  timezone?: string;
  defaultSeo?: {
    title?: string;
    description?: string;
    noindex?: boolean;
    image?: SanityImage;
  } | null;
  logo?: SanityImage;
  internalNote?: string;
};

const FALLBACK_SETTINGS: SiteSettings = {
  companyName: 'TEM Protection',
  phone: '+30 210 000 0000 (DEMO)',
  email: 'hello@example.com',
  bookingNotificationEmail: 'office@example.com',
  address: 'DEMO address, Athens, Greece',
  openingHours: 'DEMO: every day, 24 hours',
  timezone: 'Europe/Athens',
  defaultSeo: {
    title: 'TEM Protection (DEMO)',
    description: 'DEMO description: premium transfers and VIP security in Athens. Book online.',
  },
};

let settingsCache: { value: SiteSettings; expiresAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

function canQuery(): boolean {
  return Boolean(
    import.meta.env.SANITY_PROJECT_ID &&
      import.meta.env.SANITY_DATASET &&
      import.meta.env.SANITY_READ_TOKEN,
  );
}

export async function loadUiStrings(): Promise<void> {
  if (!canQuery()) return;
  try {
    const client = createSanityClient();
    const doc = await client.fetch(UI_STRINGS_QUERY);
    const overrides: Partial<Record<UiStringKey, string>> = {};
    for (const row of doc?.strings ?? []) {
      if (row?.key && typeof row.value === 'string') {
        overrides[row.key as UiStringKey] = row.value;
      }
    }
    setStringOverrides(overrides);
  } catch {
    // Keep code defaults when Sanity is unreachable (local without seed).
  }
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (settingsCache && Date.now() < settingsCache.expiresAt) {
    return settingsCache.value;
  }
  if (!canQuery()) {
    return FALLBACK_SETTINGS;
  }
  try {
    const client = createSanityClient();
    const doc = await client.fetch(SITE_SETTINGS_QUERY);
    if (!doc?.companyName || !doc.phone || !doc.email) {
      return FALLBACK_SETTINGS;
    }
    const value = doc as SiteSettings;
    settingsCache = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  } catch {
    return FALLBACK_SETTINGS;
  }
}
