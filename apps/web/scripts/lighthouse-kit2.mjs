/**
 * Kit 2: Lighthouse mobile, 3 runs, median LCP/CLS on kit 2 pages.
 * Usage: node scripts/lighthouse-kit2.mjs [baseUrl]
 */
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const base = (process.argv[2] || 'http://127.0.0.1:4321').replace(/\/$/, '');
const paths = ['/fleet', '/routes/athens-airport-to-city-centre', '/vip-security', '/contact'];

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const chrome = await launch({ chromeFlags: ['--headless', '--no-sandbox'] });
const results = [];
try {
  for (const path of paths) {
    const url = `${base}${path}`;
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance'],
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 915,
          deviceScaleFactor: 2.625,
        },
      });
      const lhr = result?.lhr;
      if (!lhr) throw new Error(`No Lighthouse result for ${url} run ${i + 1}`);
      const lcpMs = lhr.audits['largest-contentful-paint']?.numericValue ?? Infinity;
      const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? Infinity;
      runs.push({
        performance: Math.round((lhr.categories.performance?.score ?? 0) * 100),
        lcpMs: Number.isFinite(lcpMs) ? Math.round(lcpMs) : null,
        cls: Number.isFinite(cls) ? Number(cls.toFixed(3)) : null,
      });
    }
    const lcpValues = runs.map((r) => r.lcpMs).filter((n) => n != null);
    const clsValues = runs.map((r) => r.cls).filter((n) => n != null);
    const row = {
      path,
      medianPerf: median(runs.map((r) => r.performance)),
      medianLcpMs: lcpValues.length ? Math.round(median(lcpValues)) : null,
      medianCls: clsValues.length ? Number(median(clsValues).toFixed(3)) : null,
      runs,
    };
    row.pass =
      row.medianLcpMs != null &&
      row.medianCls != null &&
      row.medianLcpMs < 2500 &&
      row.medianCls < 0.1;
    results.push(row);
    console.log(
      `${path}: LCP ${row.medianLcpMs}ms CLS ${row.medianCls} perf ${row.medianPerf} ${row.pass ? 'PASS' : 'FAIL'}`,
    );
  }
} finally {
  await chrome.kill();
}

console.log(JSON.stringify({ base, results }, null, 2));
if (results.some((r) => !r.pass)) process.exit(1);
process.exit(0);
