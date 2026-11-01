import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createTestDb } from '../../../packages/db/tests/harness.mjs';
import { formatEuro } from '../src/lib/booking/pricing';

const NO_ONLINE_PRICE = 'Price on request';

function fromPriceText(cents: number | null, perHour = false): string {
  if (cents == null) return NO_ONLINE_PRICE;
  const price = formatEuro(cents);
  return perHour ? `From ${price} per hour` : `From ${price}`;
}

async function expectedFromPrices() {
  const db = await createTestDb({ seed: true });
  try {
    const { rows: classes } = await db.pool.query(
      `select key, sort_order from public.vehicle_classes where active order by sort_order, key`,
    );
    const out: { key: string; transfer: string; hourly: string }[] = [];
    for (const c of classes as { key: string }[]) {
      const { rows: transferRows } = await db.pool.query(
        `select min(p.price_cents)::int as min
           from public.zone_prices p
           join public.vehicle_classes vc on vc.id = p.class_id
          where vc.key = $1`,
        [c.key],
      );
      const { rows: hourlyRows } = await db.pool.query(
        `select h.price_per_hour_cents as cents
           from public.hourly_rates h
           join public.vehicle_classes vc on vc.id = h.class_id
          where vc.key = $1`,
        [c.key],
      );
      const transferMin = (transferRows[0] as { min: number | null } | undefined)?.min ?? null;
      const hourlyCents = (hourlyRows[0] as { cents: number | null } | undefined)?.cents ?? null;
      out.push({
        key: c.key,
        transfer: fromPriceText(transferMin),
        hourly: fromPriceText(hourlyCents, true),
      });
    }
    return out;
  } finally {
    await db.drop();
  }
}

test.describe('fleet pages (prompt 18)', () => {
  test('AC-25: fleet cards match catalog From prices; showFromPrices off → noOnlinePrice', async ({
    page,
  }) => {
    test.skip(!process.env.DATABASE_URL, 'DATABASE_URL required for DEMO seed price check');

    const expected = await expectedFromPrices();
    await page.goto('/fleet');
    for (const row of expected) {
      const card = page.locator('article.card').filter({
        has: page.locator(`a[href="/fleet/${row.key}"]`),
      });
      await expect(card).toBeVisible();
      await expect(card.locator('.from-price')).toContainText(row.transfer);
      await expect(card.locator('.from-price small')).toContainText(row.hourly);
    }

    const off = await page.goto('/dev/fleet-no-prices');
    if (!off || off.status() === 404) {
      test.skip(true, 'dev fleet-no-prices only on astro dev');
      return;
    }
    const cards = page.locator('article.card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).locator('.from-price')).toContainText(NO_ONLINE_PRICE);
    }
  });

  test('AC-33: axe, titles, canonical, sitemap, JSON-LD on fleet pages', async ({ page, request }) => {
    const fleet = await page.goto('/fleet');
    expect(fleet?.ok()).toBeTruthy();
    const fleetTitle = await page.title();
    expect(fleetTitle.length).toBeGreaterThan(0);
    const fleetCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(fleetCanonical).toMatch(/\/fleet\/?$/);

    const fleetAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      fleetAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      JSON.stringify(fleetAxe.violations, null, 2),
    ).toEqual([]);

    const vehicle = await page.goto('/fleet/demo-e-class');
    expect(vehicle?.ok()).toBeTruthy();
    const vehicleTitle = await page.title();
    expect(vehicleTitle).toMatch(/E-Class/i);
    expect(vehicleTitle).not.toBe(fleetTitle);
    const vehicleCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(vehicleCanonical).toContain('/fleet/demo-e-class');

    const scripts = page.locator('script[type="application/ld+json"]');
    const count = await scripts.count();
    expect(count).toBeGreaterThan(0);
    let sawService = false;
    let sawBreadcrumb = false;
    for (let i = 0; i < count; i++) {
      const raw = await scripts.nth(i).textContent();
      const data = JSON.parse(raw || '{}') as {
        '@type'?: string;
        offers?: { lowPrice?: string; priceCurrency?: string };
      };
      if (data['@type'] === 'Service') {
        sawService = true;
        if (data.offers) {
          expect(data.offers.priceCurrency).toBe('EUR');
          expect(Number(data.offers.lowPrice)).toBeGreaterThan(0);
        }
      }
      if (data['@type'] === 'BreadcrumbList') sawBreadcrumb = true;
    }
    expect(sawService).toBe(true);
    expect(sawBreadcrumb).toBe(true);

    const vehicleAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      vehicleAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      JSON.stringify(vehicleAxe.violations, null, 2),
    ).toEqual([]);

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
    const xml = await sitemap.text();
    expect(xml).toContain('/fleet');
    expect(xml).toContain('/fleet/demo-e-class');
  });
});
