import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAFF_EMAIL = 'office@tem.local';
const STAFF_PASS = 'OfficePass123!';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hitsFile = path.join(root, 'e2e', '.deploy-hook-hits');

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(STAFF_EMAIL);
  await page.getByLabel('Password').fill(STAFF_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(today|bookings)/);
}

function hookHits(): number {
  try {
    return Number(readFileSync(hitsFile, 'utf8').trim() || '0');
  } catch {
    return 0;
  }
}

test.describe('website update banner (prompt 23)', () => {
  test('AC-31: saving a zone shows the banner; Update calls the hook once and cools down', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/zones');
    const form = page.locator('form.zone-form').first();
    const sort = form.locator('input[name="sortOrder"]');
    const current = await sort.inputValue();
    const next = String(Number(current || '0') + 1);
    await sort.fill(next);
    const before = hookHits();
    await form.getByRole('button', { name: /Save zone/i }).click();
    await expect(page.getByText(/Prices changed: update the website/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /Update the website/i }).click();
    await expect(page.getByText(/Rebuild requested|wait|Update the website/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /Update the website/i })).toBeDisabled({
      timeout: 15_000,
    });
    expect(hookHits()).toBe(before + 1);
  });
});
