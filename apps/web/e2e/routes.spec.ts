import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createTestDb } from '../../../packages/db/tests/harness.mjs';
import { formatEuro } from '../src/lib/booking/pricing';

const NO_ONLINE_PRICE = 'Price on request';

async function expectedRoutePrices(from: string, to: string) {
  const db = await createTestDb({ seed: true });
  try {
    const { rows } = await db.pool.query(
      `select c.key, c.name, p.price_cents::int as cents
         from public.vehicle_classes c
         left join public.zone_prices p
           on p.class_id = c.id
          and p.from_zone_id = (select id from public.zones where code = $1)
          and p.to_zone_id = (select id from public.zones where code = $2)
        where c.active
        order by c.sort_order, c.key`,
      [from, to],
    );
    return rows as { key: string; name: string; cents: number | null }[];
  } finally {
    await db.drop();
  }
}

test.describe('services and route pages (prompt 19)', () => {
  test('AC-25: route table prices match catalog; AC-26 book + request-quote prefill', async ({
    page,
  }) => {
    test.skip(!process.env.DATABASE_URL, 'DATABASE_URL required for DEMO seed price check');

    const airportPort = await expectedRoutePrices('demo-airport', 'demo-port');
    await page.goto('/routes/athens-airport-to-piraeus-port');
    for (const row of airportPort) {
      const tr = page.locator(`tr[data-class="${row.key}"]`);
      await expect(tr).toBeVisible();
      if (row.cents == null) {
        await expect(tr.locator('td.num')).toContainText(NO_ONLINE_PRICE);
      } else {
        await expect(tr.locator('td.num')).toContainText(formatEuro(row.cents));
      }
    }

    const book = page.getByRole('link', { name: /Book this route/i });
    await expect(book).toHaveAttribute('href', /\/book\?from=demo-airport&to=demo-port/);
    await book.click();
    await expect(page).toHaveURL(/\/book\?from=demo-airport&to=demo-port/);
    await expect(page.locator('#from')).toHaveValue('demo-airport');
    await expect(page.locator('#to')).toHaveValue('demo-port');

    const northPort = await expectedRoutePrices('demo-north', 'demo-port');
    const noPrice = northPort.find((r) => r.cents == null);
    expect(noPrice?.key).toBe('demo-sprinter');

    await page.goto('/routes/northern-suburbs-to-piraeus-port');
    const vanRow = page.locator('tr[data-class="demo-sprinter"]');
    await expect(vanRow.locator('td.num')).toContainText(NO_ONLINE_PRICE);
    const quote = vanRow.getByRole('link', { name: /Request a quote/i });
    await expect(quote).toHaveAttribute(
      'href',
      '/request-a-transfer?from=demo-north&to=demo-port&class=demo-sprinter',
    );
  });

  test('AC-33: axe, titles, canonical, sitemap, JSON-LD on services and route', async ({
    page,
    request,
  }) => {
    const services = await page.goto('/services');
    expect(services?.ok()).toBeTruthy();
    const servicesTitle = await page.title();
    expect(servicesTitle.length).toBeGreaterThan(0);
    const servicesCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(servicesCanonical).toMatch(/\/services\/?$/);

    const servicesAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      servicesAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      JSON.stringify(servicesAxe.violations, null, 2),
    ).toEqual([]);

    const route = await page.goto('/routes/athens-airport-to-piraeus-port');
    expect(route?.ok()).toBeTruthy();
    const routeTitle = await page.title();
    expect(routeTitle.length).toBeGreaterThan(0);
    expect(routeTitle).toMatch(/Airport|Piraeus|Elite Protection/i);
    expect(routeTitle).not.toBe(servicesTitle);
    const routeCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(routeCanonical).toContain('/routes/athens-airport-to-piraeus-port');

    const scripts = page.locator('script[type="application/ld+json"]');
    const count = await scripts.count();
    expect(count).toBeGreaterThan(0);
    let sawService = false;
    let sawFaq = false;
    let sawBreadcrumb = false;
    for (let i = 0; i < count; i++) {
      const raw = await scripts.nth(i).textContent();
      const data = JSON.parse(raw || '{}') as {
        '@type'?: string;
        offers?: Array<{ price?: string; priceCurrency?: string }> | {
          price?: string;
          priceCurrency?: string;
          lowPrice?: string;
        };
      };
      if (data['@type'] === 'Service') {
        sawService = true;
        if (Array.isArray(data.offers)) {
          expect(data.offers.length).toBeGreaterThan(0);
          for (const offer of data.offers) {
            expect(offer.priceCurrency).toBe('EUR');
            expect(Number(offer.price)).toBeGreaterThan(0);
          }
        }
      }
      if (data['@type'] === 'FAQPage') sawFaq = true;
      if (data['@type'] === 'BreadcrumbList') sawBreadcrumb = true;
    }
    expect(sawService).toBe(true);
    expect(sawFaq).toBe(true);
    expect(sawBreadcrumb).toBe(true);

    const routeAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      routeAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      JSON.stringify(routeAxe.violations, null, 2),
    ).toEqual([]);

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
    const xml = await sitemap.text();
    expect(xml).toContain('/services');
    expect(xml).toContain('/routes/athens-airport-to-piraeus-port');
    expect(xml).toContain('/routes/northern-suburbs-to-piraeus-port');
  });
});
