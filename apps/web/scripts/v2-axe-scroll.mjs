/**
 * Axe + no horizontal scroll on public routes at 390 / 1024 / 1440.
 * Usage: node scripts/v2-axe-scroll.mjs [baseUrl]
 */
import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';

const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = createRequire(require.resolve('@playwright/test'))('playwright');

const base = (process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:4321').replace(/\/$/, '');
const widths = [390, 1024, 1440];
const routes = [
  '/',
  '/fleet',
  '/fleet/v-class',
  '/services',
  '/vip-security',
  '/about',
  '/contact',
  '/book',
  '/request-a-transfer',
  '/legal',
  '/booking/find',
];

const browser = await chromium.launch();
const failures = [];
try {
  for (const width of widths) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    for (const path of routes) {
      const url = `${base}${path}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => {
        const doc = globalThis.document.documentElement;
        const body = globalThis.document.body;
        return Math.max(doc.scrollWidth - doc.clientWidth, body.scrollWidth - body.clientWidth);
      });
      if (width === 390 && overflow > 1) {
        failures.push(`${path} @${width}: horizontal scroll ${overflow}px`);
      }
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const bad = axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''));
      if (bad.length) {
        failures.push(
          `${path} @${width}: axe ${bad.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`,
        );
      } else {
        console.log(`ok ${path} @${width}`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('FAILURES:');
  for (const f of failures) console.error(' ', f);
  process.exit(1);
}
console.log(`v2-axe-scroll: pass (${routes.length} routes × ${widths.length} widths)`);
