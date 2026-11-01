/**
 * AC-20: Lighthouse mobile on home - performance ≥ 90, LCP < 2.5s, CLS < 0.1.
 * Usage: node scripts/lighthouse-home.mjs [url]
 */
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const url = process.argv[2] || 'http://127.0.0.1:4321/';

const chrome = await launch({ chromeFlags: ['--headless', '--no-sandbox'] });
try {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance'],
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 412, height: 915, deviceScaleFactor: 2.625 },
  });
  const lhr = result.lhr;
  const perf = Math.round((lhr.categories.performance?.score ?? 0) * 100);
  const lcpMs = lhr.audits['largest-contentful-paint']?.numericValue ?? Infinity;
  const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? Infinity;
  console.log(
    JSON.stringify(
      {
        url,
        performance: perf,
        lcpMs: Math.round(lcpMs),
        lcpSec: Number((lcpMs / 1000).toFixed(2)),
        cls: Number(cls.toFixed(3)),
        pass: perf >= 90 && lcpMs < 2500 && cls < 0.1,
      },
      null,
      2,
    ),
  );
  if (perf < 90 || lcpMs >= 2500 || cls >= 0.1) process.exit(1);
} finally {
  await chrome.kill();
}
