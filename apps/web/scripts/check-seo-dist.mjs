#!/usr/bin/env node
/**
 * AC-33 build check: sitemap contents + unique title/description/canonical in built HTML.
 * Usage: node scripts/check-seo-dist.mjs [staticDir]
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] || join(process.cwd(), '.vercel', 'output', 'static');
const problems = [];

function fail(msg) {
  problems.push(msg);
  console.error(`FAIL: ${msg}`);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function walkHtml(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkHtml(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

if (!existsSync(root)) {
  fail(`static dir missing: ${root} (run pnpm build first)`);
  process.exit(1);
}

const sitemapPath = join(root, 'sitemap.xml');
if (!existsSync(sitemapPath)) {
  fail('sitemap.xml missing from build output');
} else {
  const xml = readFileSync(sitemapPath, 'utf8');
  const required = [
    '/',
    '/fleet',
    '/services',
    '/vip-security',
    '/about',
    '/contact',
    '/request-a-transfer',
    '/privacy',
    '/cookies',
    '/terms',
    '/cancellation',
  ];
  for (const path of required) {
    if (!xml.includes(path === '/' ? '://' : path)) {
      // home is loc ending with host/ or path /
      if (path === '/') {
        if (!/<loc>[^<]+\/<\/loc>/.test(xml) && !xml.includes(`localhost:4321/`)) {
          fail(`sitemap missing ${path}`);
        }
      } else if (!xml.includes(path)) {
        fail(`sitemap missing ${path}`);
      }
    }
  }
  if (!xml.includes('/fleet/')) fail('sitemap missing at least one /fleet/<key>');
  if (!xml.includes('/routes/')) fail('sitemap missing at least one /routes/<slug>');
  for (const banned of ['/book', '/booking/', '/thank-you/']) {
    if (xml.includes(banned)) fail(`sitemap must not include ${banned}`);
  }
  if (problems.length === 0) ok('sitemap contains kit 2 public URLs and omits book/thank-you');
}

const htmlFiles = walkHtml(root).filter((p) => {
  const rel = relative(root, p).replace(/\\/g, '/');
  if (rel === '404.html' || rel === '500.html') return false;
  return !rel.startsWith('book/') && !rel.includes('/booking/') && !rel.includes('thank-you/');
});

const titles = new Map();
const descriptions = new Map();
const canonicals = new Map();

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const rel = relative(root, file).replace(/\\/g, '/');
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1]?.trim() || '';
  const description =
    (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ||
      html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i) ||
      [])[1]?.trim() || '';
  const canonical =
    (html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i) ||
      html.match(/<link\s+href=["']([^"']*)["']\s+rel=["']canonical["']/i) ||
      [])[1]?.trim() || '';

  if (!title) fail(`${rel}: missing <title>`);
  else if (titles.has(title)) fail(`${rel}: duplicate title with ${titles.get(title)}`);
  else titles.set(title, rel);

  if (!description) fail(`${rel}: missing meta description`);
  else if (descriptions.has(description))
    fail(`${rel}: duplicate description with ${descriptions.get(description)}`);
  else descriptions.set(description, rel);

  if (!canonical) fail(`${rel}: missing canonical`);
  else if (canonicals.has(canonical))
    fail(`${rel}: duplicate canonical with ${canonicals.get(canonical)}`);
  else canonicals.set(canonical, rel);
}

if (htmlFiles.length === 0) fail('no HTML files found to crawl');
else if (problems.every((p) => !p.includes('duplicate') && !p.includes('missing <title>'))) {
  ok(`crawled ${htmlFiles.length} HTML files with unique SEO fields`);
}

if (problems.length) {
  console.error(`SEO dist check failed with ${problems.length} issue(s).`);
  process.exit(1);
}
console.log('SEO dist check passed.');
process.exit(0);
