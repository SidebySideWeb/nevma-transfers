/**
 * Lighthouse mobile on /, /fleet, /book — perf ≥ 90, a11y 100.
 * Usage: node scripts/lighthouse-v2.mjs [baseUrl]
 */
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const base = (process.argv[2] || 'http://127.0.0.1:4321').replace(/\/$/, '');
const paths = ['/', '/fleet', '/book'];
const MIN_PERF = 90;
const MIN_A11Y = 100;

const chrome = await launch({ chromeFlags: ['--headless', '--no-sandbox'] });
const rows = [];
try {
  for (const path of paths) {
    const url = `${base}${path}`;
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility'],
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 412,
        height: 915,
        deviceScaleFactor: 2.625,
      },
    });
    const lhr = result?.lhr;
    if (!lhr) throw new Error(`No Lighthouse result for ${url}`);
    const perf = Math.round((lhr.categories.performance?.score ?? 0) * 100);
    const a11y = Math.round((lhr.categories.accessibility?.score ?? 0) * 100);
    const pass = perf >= MIN_PERF && a11y >= MIN_A11Y;
    rows.push({ path, perf, a11y, pass });
    console.log(`${path}: perf ${perf} a11y ${a11y} ${pass ? 'PASS' : 'FAIL'}`);
  }
} finally {
  await chrome.kill();
}

console.log(JSON.stringify({ base, rows }, null, 2));
if (rows.some((r) => !r.pass)) process.exit(1);
