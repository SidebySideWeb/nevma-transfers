import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test.describe('home and legal pages', () => {
  test('home renders DEMO content', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /DEMO|Arrive|Travel|Discreet luxury/i,
    );
    await expect(page.locator('script[type="application/ld+json"]').first()).toHaveCount(1);
  });

  for (const slug of ['privacy', 'cookies', 'terms', 'cancellation'] as const) {
    test(`${slug} renders DEMO content`, async ({ page }) => {
      await page.goto(`/${slug}`);
      await expect(page.locator('#main')).toContainText(/DEMO/i);
    });
  }

  test('AC-19 axe clean on home and legal', async ({ page }) => {
    for (const route of ['/', '/privacy', '/cookies', '/terms', '/cancellation']) {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(serious, `${route}: ${JSON.stringify(serious)}`).toEqual([]);
    }
  });

  test('sitemap and robots are correct', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBeTruthy();
    const robotsText = await robots.text();
    expect(robotsText).toContain('Disallow: /book');
    expect(robotsText).toContain('Disallow: /booking/');
    expect(robotsText).toContain('Disallow: /api/');
    expect(robotsText).toMatch(/Sitemap:\s+\S+\/sitemap\.xml/);

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
    const xml = await sitemap.text();
    expect(xml).toContain('/privacy');
    expect(xml).toContain('/cookies');
    expect(xml).toContain('/terms');
    expect(xml).toContain('/cancellation');
    expect(xml).not.toContain('/book');
    expect(xml).not.toContain('/api/');
  });

  test('security headers present in vercel.json for preview builds', async () => {
    const raw = readFileSync(path.join(root, 'vercel.json'), 'utf8');
    const cfg = JSON.parse(raw) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const all = cfg.headers.flatMap((h) => h.headers.map((x) => x.key));
    expect(all).toContain('Strict-Transport-Security');
    expect(all).toContain('Content-Security-Policy');
    expect(all).toContain('X-Content-Type-Options');
    expect(all).toContain('Referrer-Policy');
    expect(all).toContain('Permissions-Policy');
    expect(all).toContain('X-Frame-Options');
    const csp = cfg.headers
      .flatMap((h) => h.headers)
      .find((h) => h.key === 'Content-Security-Policy')?.value;
    expect(csp).toContain('challenges.cloudflare.com');
    expect(csp).toContain('cdn.sanity.io');
    expect(csp).toContain('vivapayments.com');
  });
});
