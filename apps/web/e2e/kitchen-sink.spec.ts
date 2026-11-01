import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('kitchen sink (prompt 17)', () => {
  test('kit 2 sections, no horizontal scroll, menu keyboard, axe clean', async ({ page }) => {
    const res = await page.goto('/dev/kitchen-sink');
    if (!res || res.status() === 404) {
      test.skip(true, 'Kitchen sink unavailable (needs astro dev)');
      return;
    }

    await expect(page.getByRole('heading', { name: /DEMO Features/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /DEMO How it works/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /DEMO Choose your vehicle/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /DEMO Popular routes/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /DEMO Get in touch/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /DEMO Contact form/i })).toBeVisible();

    for (const width of [390, 1440] as const) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      });
      expect(overflow, `${width}px horizontal scroll`).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 390, height: 900 });
    const menu = page.locator('details.mobile-menu');
    await menu.locator('summary').click();
    await expect(menu).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open');

    await menu.locator('summary').click();
    await menu.locator('ul a').first().click();
    await expect(menu).not.toHaveAttribute('open');

    await page.goto('/dev/kitchen-sink');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
