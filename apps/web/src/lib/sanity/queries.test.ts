import { beforeAll, describe, expect, it } from 'vitest';
import type { SanityClient } from '@sanity/client';
import { createSanityClient, sanityConfigured } from './client';
import {
  FORM_BY_KEY_QUERY,
  FORMS_QUERY,
  PAGE_BY_SLUG_QUERY,
  PAGES_STANDARD_QUERY,
  ROUTES_QUERY,
  SITE_SETTINGS_QUERY,
  UI_STRINGS_QUERY,
  VEHICLE_CLASSES_QUERY,
} from './queries';
import { uiStringDefaults } from '@studio-strings';

const runLive = sanityConfigured();

describe.skipIf(!runLive)('Sanity queries (live dataset)', () => {
  // Create only in beforeAll: describe.skipIf still runs this body during collect.
  let client: SanityClient;
  beforeAll(() => {
    client = createSanityClient();
  });

  it('settings has a phone, booking notification email and showFromPrices', async () => {
    const settings = await client.fetch(SITE_SETTINGS_QUERY);
    expect(settings?.phone).toBeTruthy();
    expect(settings?.bookingNotificationEmail).toBeTruthy();
    expect(settings?.showFromPrices).toBe(true);
  });

  it(`uiStrings has ${uiStringDefaults.length} strings`, async () => {
    const ui = await client.fetch(UI_STRINGS_QUERY);
    expect(ui?.strings?.length).toBe(uiStringDefaults.length);
  });

  it('has five V2 vehicle classes', async () => {
    const classes = await client.fetch(VEHICLE_CLASSES_QUERY);
    const keys = (classes ?? []).map((c: { key: string }) => c.key).sort();
    expect(keys).toEqual([
      'demo-e-class',
      'demo-s-class',
      'demo-sprinter',
      'demo-v-class',
      'demo-vito',
    ]);
  });

  it('page home has a hero section', async () => {
    const page = await client.fetch(PAGE_BY_SLUG_QUERY, { slug: 'home' });
    expect(page?.sections?.some((s: { _type: string }) => s._type === 'hero')).toBe(true);
  });

  it('has 6 standard pages', async () => {
    const pages = await client.fetch(PAGES_STANDARD_QUERY);
    expect(pages?.length).toBe(6);
    const slugs = (pages ?? []).map((p: { slug: string }) => p.slug).sort();
    expect(slugs).toEqual([
      'about',
      'contact',
      'fleet',
      'request-a-transfer',
      'services',
      'vip-security',
    ]);
  });

  it('has 4 routes with DEMO zone codes', async () => {
    const routes = await client.fetch(ROUTES_QUERY);
    expect(routes?.length).toBe(4);
    const pairs = (routes ?? [])
      .map((r: { fromZone: string; toZone: string }) => `${r.fromZone}→${r.toZone}`)
      .sort();
    expect(pairs).toContain('demo-airport→demo-centre');
  });

  it('has 3 forms; contact has 5 topics', async () => {
    const forms = await client.fetch(FORMS_QUERY);
    expect(forms?.length).toBe(3);
    const contact = await client.fetch(FORM_BY_KEY_QUERY, { key: 'contact' });
    expect(contact?.topics?.length).toBe(5);
  });
});
