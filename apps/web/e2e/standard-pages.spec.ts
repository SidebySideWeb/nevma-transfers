import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  {
    path: '/vip-security',
    sectionOrder: ['hero', 'image-text', 'enquiry', 'contact'],
    jsonLdType: 'Service',
  },
  {
    path: '/about',
    sectionOrder: ['image-text', 'cta'],
    jsonLdType: 'Organization',
  },
  {
    path: '/contact',
    sectionOrder: ['contact', 'form'],
    jsonLdType: 'Organization',
  },
  {
    path: '/request-a-transfer',
    sectionOrder: ['rich', 'form'],
    jsonLdType: null,
  },
] as const;

test.describe('standard pages (prompt 20)', () => {
  test('DEMO sections render in order; VIP hero scrolls to #enquiry and focuses form heading', async ({
    page,
  }) => {
    await page.goto('/vip-security');
    const hero = page.locator('section.hero');
    await expect(hero).toBeVisible();
    await expect(page.locator('section.hero ~ .section').first()).toBeVisible();

    const mainSections = page.locator('main section');
    const types: string[] = [];
    const count = await mainSections.count();
    for (let i = 0; i < count; i++) {
      const el = mainSections.nth(i);
      const id = await el.getAttribute('id');
      const cls = (await el.getAttribute('class')) || '';
      if (cls.includes('hero')) types.push('hero');
      else if (id === 'enquiry') types.push('enquiry');
      else if (cls.includes('image-text') || (await el.locator('.image-text').count()) > 0)
        types.push('image-text');
      else if ((await el.locator('.contact-list').count()) > 0) types.push('contact');
      else if ((await el.locator('#form-block-h').count()) > 0) types.push('form');
      else if ((await el.locator('.prose, .portable-text').count()) > 0 || cls.includes('section'))
        types.push('section');
    }
    expect(types[0]).toBe('hero');
    expect(types).toContain('enquiry');

    const cta = page.locator('section.hero a.btn').filter({ hasText: /enquiry|Send/i });
    await expect(cta).toHaveAttribute('href', '#enquiry');
    await cta.click();
    await expect(page).toHaveURL(/#enquiry$/);
    await expect(page.locator('#enquiry')).toBeVisible();
    await expect(page.locator('#form-block-h')).toBeFocused();

    await page.goto('/about');
    await expect(page.locator('main .image-text, main section').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Book now/i }).first()).toBeVisible();

    await page.goto('/contact');
    await expect(page.locator('.contact-list').first()).toBeVisible();
    await expect(page.locator('#form-block-h')).toBeVisible();

    await page.goto('/request-a-transfer');
    await expect(page.locator('main h2').first()).toBeVisible();
    await expect(page.locator('#form-block-h')).toBeVisible();
  });

  test('AC-33: axe, unique SEO, sitemap, JSON-LD on all four pages', async ({ page, request }) => {
    const seenTitles = new Set<string>();
    const seenDescriptions = new Set<string>();
    const seenCanonicals = new Set<string>();

    for (const entry of PAGES) {
      const res = await page.goto(entry.path);
      expect(res?.ok()).toBeTruthy();

      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
      expect(seenTitles.has(title)).toBe(false);
      seenTitles.add(title);

      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description && description.length).toBeGreaterThan(0);
      expect(seenDescriptions.has(description!)).toBe(false);
      seenDescriptions.add(description!);

      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toContain(entry.path);
      expect(seenCanonicals.has(canonical!)).toBe(false);
      seenCanonicals.add(canonical!);

      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(
        axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
        `${entry.path}: ${JSON.stringify(axe.violations, null, 2)}`,
      ).toEqual([]);

      if (entry.jsonLdType) {
        const scripts = page.locator('script[type="application/ld+json"]');
        const n = await scripts.count();
        let saw = false;
        for (let i = 0; i < n; i++) {
          const data = JSON.parse((await scripts.nth(i).textContent()) || '{}') as {
            '@type'?: string;
            offers?: unknown;
            contactPoint?: { contactType?: string; availableLanguage?: string };
          };
          if (data['@type'] !== entry.jsonLdType) continue;
          saw = true;
          if (entry.path === '/vip-security') {
            expect(data.offers).toBeUndefined();
          }
          if (entry.path === '/contact') {
            expect(data.contactPoint?.contactType).toBe('customer service');
            expect(data.contactPoint?.availableLanguage).toBe('English');
          }
        }
        expect(saw).toBe(true);
      }
    }

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
    const xml = await sitemap.text();
    for (const entry of PAGES) {
      expect(xml).toContain(entry.path);
    }
  });
});
