/**
 * Client-review screenshots at 1440 and 390 into docs/v2-review/.
 * Needs a running site (PUBLIC_V2_PREVIEW=1 build + serve) or BASE_URL.
 *
 * Usage: node scripts/v2-review-screenshots.mjs [baseUrl]
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = createRequire(require.resolve('@playwright/test'))('playwright');

const base = process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:4321';
const outDir = resolve(fileURLToPath(new URL('../../../docs/v2-review', import.meta.url)));
mkdirSync(outDir, { recursive: true });

const pages = [
  { path: '/', name: '01-home' },
  { path: '/fleet', name: '02-fleet' },
  { path: '/fleet/v-class', name: '03-vehicle' },
  { path: '/services', name: '04-services' },
  { path: '/vip-security', name: '05-vip-security' },
  { path: '/about', name: '06-about' },
  { path: '/contact', name: '07-contact' },
  { path: '/book', name: '08-book' },
  { path: '/book#vehicle', name: '08-book-2' },
  { path: '/book#details', name: '08-book-3' },
  { path: '/book#review', name: '08-book-4' },
];

const widths = [
  { w: 1440, prefix: '' },
  { w: 390, prefix: 'phone-' },
];

const browser = await chromium.launch();
try {
  for (const { w, prefix } of widths) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    for (const p of pages) {
      await page.goto(new URL(p.path, base).href, { waitUntil: 'networkidle' });
      await page.evaluate(() => globalThis.document.fonts.ready);
      const file = join(outDir, `${prefix}${p.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log('wrote', file);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
