import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function futureLocal(): string {
  const d = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Approximate Athens local for tests (server validates with Europe/Athens).
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fillContact(page: Page) {
  await page.locator('#topic').selectOption({ index: 1 });
  await page.locator('#name').fill('Ada Lovelace');
  await page.locator('#email').fill('ada@example.com');
  await page.locator('#message').fill('Hello from the DEMO contact form.');
  await page.locator('input[name="consent"]').check();
}

async function fillVip(page: Page) {
  await page.locator('#name').fill('Ada Lovelace');
  await page.locator('#email').fill('ada@example.com');
  await page.locator('#phone').fill('+30 210 1111111');
  await page.locator('#serviceType').fill('Close protection');
  await page.locator('input[name="consent"]').check();
}

async function fillTransfer(page: Page) {
  await page.locator('#fromZone').selectOption('demo-airport');
  await page.locator('#toZone').selectOption('demo-port');
  await page.locator('#datetime').fill(futureLocal());
  await page.locator('#passengers').fill('2');
  await page.locator('#name').fill('Ada Lovelace');
  await page.locator('#email').fill('ada@example.com');
  await page.locator('#phone').fill('+30 210 1111111');
  await page.locator('input[name="consent"]').check();
}

test.describe('forms UI (prompt 22) — JS on', () => {
  test('AC-27: each form submits to thank-you; validation keeps values and focuses summary', async ({
    page,
  }) => {
    await page.goto('/contact');
    await page.locator('form[data-tem-form="contact"] button[data-submit]').click();
    await expect(page.locator('#form-error-summary')).toBeFocused();
    await page.locator('#name').fill('Kept Name');
    await fillContact(page);
    await page.locator('#name').fill('Kept Name');
    await page.locator('form[data-tem-form="contact"] button[data-submit]').click();
    await expect(page).toHaveURL(/\/thank-you\/contact/);
    await expect(page.locator('#thank-you-h')).toBeVisible();

    await page.goto('/vip-security');
    await fillVip(page);
    await page.locator('form[data-tem-form="vip-security"] button[data-submit]').click();
    await expect(page).toHaveURL(/\/thank-you\/vip-security/);

    await page.goto('/request-a-transfer');
    await fillTransfer(page);
    await page.locator('form[data-tem-form="transfer-request"] button[data-submit]').click();
    await expect(page).toHaveURL(/\/thank-you\/transfer-request/);
  });

  test('AC-26: request form prefills from query string', async ({ page }) => {
    await page.goto(
      '/request-a-transfer?from=demo-north&to=demo-port&class=demo-v-class',
    );
    await expect(page.locator('#fromZone')).toHaveValue('demo-north');
    await expect(page.locator('#toZone')).toHaveValue('demo-port');
    await expect(page.locator('#vehicleClass')).toHaveValue('demo-v-class');
  });

  test('AC-33/AC-19: axe clean; keyboard completes contact form', async ({ page }) => {
    for (const path of [
      '/contact',
      '/vip-security',
      '/request-a-transfer',
      '/thank-you/contact',
      '/thank-you/vip-security',
      '/thank-you/transfer-request',
    ]) {
      await page.goto(path);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(
        axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
        `${path}: ${JSON.stringify(axe.violations, null, 2)}`,
      ).toEqual([]);
    }

    await page.goto('/contact');
    await page.locator('#topic').focus();
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.locator('#name').fill('Keyboard User');
    await page.locator('#email').fill('keys@example.com');
    await page.locator('#message').fill('Sent with keyboard.');
    await page.locator('input[name="consent"]').focus();
    await page.keyboard.press('Space');
    await page.locator('button[data-submit]').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/thank-you\/contact/);
  });
});

test.describe('forms UI (prompt 22) — JS off', () => {
  test.use({ javaScriptEnabled: false });

  test('AC-27 no-JS: submit lands on thank-you; errors re-render with values', async ({ page }) => {
    await page.goto('/contact');
    await page.locator('form[data-tem-form="contact"] button[type="submit"]').click();
    await expect(page).toHaveURL(/\/contact/);
    await expect(page.locator('#form-error-summary')).toBeVisible();

    await page.locator('#topic').selectOption({ index: 1 });
    await page.locator('#name').fill('NoJS Ada');
    await page.locator('#email').fill('nojs@example.com');
    await page.locator('#message').fill('No JS submit');
    await page.locator('input[name="consent"]').check();
    await page.locator('form[data-tem-form="contact"] button[type="submit"]').click();
    await expect(page).toHaveURL(/\/thank-you\/contact/);

    await page.goto('/vip-security');
    await fillVip(page);
    await page.locator('form[data-tem-form="vip-security"] button[type="submit"]').click();
    await expect(page).toHaveURL(/\/thank-you\/vip-security/);

    await page.goto('/request-a-transfer');
    await fillTransfer(page);
    await page.locator('form[data-tem-form="transfer-request"] button[type="submit"]').click();
    await expect(page).toHaveURL(/\/thank-you\/transfer-request/);
  });

  test('AC-26 no-JS: prefill from query still selected', async ({ page }) => {
    await page.goto(
      '/request-a-transfer?from=demo-north&to=demo-port&class=demo-v-class',
    );
    await expect(page.locator('#fromZone')).toHaveValue('demo-north');
    await expect(page.locator('#toZone')).toHaveValue('demo-port');
    await expect(page.locator('#vehicleClass')).toHaveValue('demo-v-class');
  });
});
