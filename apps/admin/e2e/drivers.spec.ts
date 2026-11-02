import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAFF_EMAIL = 'office@tem.local';
const STAFF_PASS = 'OfficePass123!';
const DRIVER_EMAIL = 'e2e-driver@tem.local';
const DRIVER_PASS = 'DriverPass123!';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function setNativeSelect(page: Page, id: string, value: string, opts?: { force?: boolean }) {
  await page.locator(`#${id}`).evaluate(
    (el, args) => {
      const sel = el as HTMLSelectElement;
      const opt = [...sel.options].find((o) => o.value === args.value);
      if (opt && args.force) opt.disabled = false;
      sel.value = args.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { value, force: Boolean(opts?.force) },
  );
}

async function axeCheck(page: Page) {
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `axe @ ${width}`).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

function adminClient() {
  const url = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY required for drivers e2e');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

test.describe.configure({ mode: 'serial' });

let refA = '';
let refB = '';

test.beforeAll(() => {
  execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "${path.join(root, 'e2e', 'seed-drivers.sql')}"`,
    { stdio: 'inherit' },
  );
  const out = execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA -c "select reference from public.bookings where customer_email = 'e2e-drivers-overlap@example.com' order by pickup_at"`,
    { encoding: 'utf8' },
  );
  const refs = out
    .trim()
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (refs.length < 2) throw new Error(`expected 2 overlap bookings, got ${refs.join(',')}`);
  refA = refs[0]!;
  refB = refs[1]!;
});

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'drivers suite runs once on desktop');
});

test('DR-03 invite + driver welcome only; DR-02 overlap; timeline; shift', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, STAFF_EMAIL, STAFF_PASS);
  await expect(page).toHaveURL(/\/bookings/);

  await page.goto('/drivers');
  await expect(page.getByRole('heading', { name: 'Drivers' })).toBeVisible();
  await axeCheck(page);

  await page.getByRole('button', { name: 'Add driver' }).click();
  const dlg = page.getByRole('dialog', { name: /Add driver/ });
  await expect(dlg).toBeVisible();
  await dlg.locator('#ad-n').fill('E2E Driver');
  await dlg.locator('#ad-p').fill('+306900009901');
  await dlg.locator('#ad-e').fill(DRIVER_EMAIL);
  await setNativeSelect(page, 'ad-t', 'employee');
  // Invite via internal route after create (keep dialog default checked).
  await dlg.getByRole('button', { name: 'Add driver' }).click();
  await expect(page).toHaveURL(/\/drivers\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const driverUrl = page.url();
  const driverId = /\/drivers\/([0-9a-f-]{36})/.exec(driverUrl)![1]!;

  // Ensure Auth user exists with a known password (invite may have created the user).
  const sb = adminClient();
  const listed = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = listed.data.users.find((u) => (u.email || '').toLowerCase() === DRIVER_EMAIL);
  if (!user) {
    const created = await sb.auth.admin.createUser({
      email: DRIVER_EMAIL,
      password: DRIVER_PASS,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    user = created.data.user!;
  } else {
    const upd = await sb.auth.admin.updateUserById(user.id, {
      password: DRIVER_PASS,
      email_confirm: true,
    });
    expect(upd.error).toBeNull();
  }
  execSync(
    `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -c "update public.drivers set user_id = '${user.id}' where id = '${driverId}'"`,
    { stdio: 'inherit' },
  );

  await page.goto(driverUrl);
  await expect(page.getByText('Linked')).toBeVisible();
  await axeCheck(page);

  // Sign out staff, sign in as driver — only welcome reachable.
  await page.evaluate(async () => {
    await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
  });
  await login(page, DRIVER_EMAIL, DRIVER_PASS);
  await expect(page).toHaveURL(/\/driver-welcome/);
  await expect(page.getByText(/drivers' app is coming/i)).toBeVisible();
  await page.goto('/bookings');
  await expect(page).toHaveURL(/\/driver-welcome/);
  await page.goto('/drivers');
  await expect(page).toHaveURL(/\/driver-welcome/);

  await page.evaluate(async () => {
    await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
  });
  await login(page, STAFF_EMAIL, STAFF_PASS);
  await expect(page).toHaveURL(/\/bookings/);

  // Assign to first booking.
  await page.goto(`/bookings/${refA}`);
  await expect(page.getByRole('form', { name: 'Assign driver' })).toBeVisible();
  await setNativeSelect(page, 'drv', driverId);
  await page.getByRole('button', { name: 'Assign driver', exact: true }).click();
  await expect(page.locator('#drv-err')).toHaveCount(0);
  await expect(page.locator('.timeline')).toContainText(/Driver assigned/, { timeout: 15_000 });

  // Overlapping second booking refused with clash reference (option is disabled in UI; force for DR-02).
  await page.goto(`/bookings/${refB}`);
  await setNativeSelect(page, 'drv', driverId, { force: true });
  await page.getByRole('button', { name: 'Assign driver', exact: true }).click();
  await expect(page.locator('#drv-err')).toContainText(refA, { timeout: 15_000 });

  // Timeline on first booking.
  await page.goto(`/bookings/${refA}`);
  await expect(page.getByRole('heading', { name: 'Trip timeline' })).toBeVisible();
  await expect(page.locator('.timeline')).toContainText(/Driver assigned/);

  // Correct a shift on the driver page.
  await page.goto(driverUrl);
  await page.getByRole('button', { name: /Add a shift|Add shift/i }).click();
  const shiftDlg = page.getByRole('dialog');
  await expect(shiftDlg).toBeVisible();
  const vehicleVal = await shiftDlg.locator('#sh-v option').nth(1).getAttribute('value');
  expect(vehicleVal).toBeTruthy();
  await setNativeSelect(page, 'sh-v', vehicleVal!);
  await shiftDlg.locator('#sh-s').fill('2027-09-10T08:00');
  await shiftDlg.locator('#sh-e').fill('2027-09-10T18:00');
  await shiftDlg.locator('#sh-so').fill('1000');
  await shiftDlg.locator('#sh-eo').fill('1120');
  await shiftDlg.locator('#sh-n').fill('e2e office correction');
  await shiftDlg.getByRole('button', { name: 'Save shift' }).click();
  await expect(page.getByRole('region', { name: /Shifts of/ })).toContainText('08:00', {
    timeout: 15_000,
  });
  await expect(page.getByRole('region', { name: /Shifts of/ })).toContainText('120');
});
