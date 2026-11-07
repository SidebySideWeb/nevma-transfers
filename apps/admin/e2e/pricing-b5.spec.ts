/**
 * B5: axe on Rates and Simulator (1024 + 1440).
 * Opt-in: start admin with FEATURE_DISTANCE_PRICING=true (and Maps + quote secrets)
 * and set QA_DISTANCE_PRICING=1. Do not reuse a distance-off server.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const STAFF_EMAIL = 'office@tem.local';
const STAFF_PASS = 'OfficePass123!';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(STAFF_EMAIL);
  await page.getByLabel('Password').fill(STAFF_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(today|bookings)/);
}

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'B5 axe once on desktop project');
  test.skip(process.env.QA_DISTANCE_PRICING !== '1', 'set QA_DISTANCE_PRICING=1 with distance pricing on');
});

test('B5 axe on Rates and Simulator at 1024 and 1440', async ({ page }) => {
  await login(page);
  const routes = ['/pricing/rates', '/pricing/simulator'] as const;
  for (const route of routes) {
    for (const width of [1024, 1440] as const) {
      await page.setViewportSize({ width, height: 900 });
      const res = await page.goto(route);
      expect(res?.status(), route).toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(serious, `${route}@${width}: ${JSON.stringify(serious)}`).toEqual([]);
    }
  }
});
