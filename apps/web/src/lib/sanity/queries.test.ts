import { describe, expect, it } from 'vitest';
import { createSanityClient, sanityConfigured } from './client';
import {
  PAGE_BY_SLUG_QUERY,
  SITE_SETTINGS_QUERY,
  UI_STRINGS_QUERY,
  VEHICLE_CLASSES_QUERY,
} from './queries';
import { uiStringDefaults } from '@studio-strings';

const runLive = sanityConfigured();

describe.skipIf(!runLive)('Sanity queries (live dataset)', () => {
  const client = createSanityClient();

  it('settings has a phone and booking notification email', async () => {
    const settings = await client.fetch(SITE_SETTINGS_QUERY);
    expect(settings?.phone).toBeTruthy();
    expect(settings?.bookingNotificationEmail).toBeTruthy();
  });

  it(`uiStrings has ${uiStringDefaults.length} strings`, async () => {
    const ui = await client.fetch(UI_STRINGS_QUERY);
    expect(ui?.strings?.length).toBe(uiStringDefaults.length);
  });

  it('has vehicle classes demo-sedan, demo-suv, demo-van', async () => {
    const classes = await client.fetch(VEHICLE_CLASSES_QUERY);
    const keys = (classes ?? []).map((c: { key: string }) => c.key).sort();
    expect(keys).toEqual(['demo-sedan', 'demo-suv', 'demo-van']);
  });

  it('page home has a hero section', async () => {
    const page = await client.fetch(PAGE_BY_SLUG_QUERY, { slug: 'home' });
    expect(page?.sections?.some((s: { _type: string }) => s._type === 'hero')).toBe(true);
  });
});
