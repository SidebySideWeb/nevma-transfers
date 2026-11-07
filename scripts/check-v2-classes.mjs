#!/usr/bin/env node
/**
 * Public website class gate: class tokens on the V2 public surface must exist in
 * apps/web/src/styles/v2.css, or start with `js-` (behaviour hooks).
 *
 * Usage: node scripts/check-v2-classes.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V2_CSS = join(ROOT, 'apps/web/src/styles/v2.css');

const SCAN_ROOTS = [
  join(ROOT, 'apps/web/src/pages'),
  join(ROOT, 'apps/web/src/layouts/PublicLayout.astro'),
  join(ROOT, 'apps/web/src/components/v2/SiteHeader.astro'),
  join(ROOT, 'apps/web/src/components/v2/SiteFooter.astro'),
  join(ROOT, 'apps/web/src/components/v2/StatusHero.astro'),
  join(ROOT, 'apps/web/src/components/v2/Heading.astro'),
  join(ROOT, 'apps/web/src/components/v2/CtaLink.astro'),
  join(ROOT, 'apps/web/src/components/v2/BrandDropdown.tsx'),
  join(ROOT, 'apps/web/src/components/v2/QuickBooking.tsx'),
  join(ROOT, 'apps/web/src/components/v2/VehicleHero.astro'),
  join(ROOT, 'apps/web/src/components/v2/VehicleTabs.astro'),
  join(ROOT, 'apps/web/src/components/v2/LegalBody.astro'),
  join(ROOT, 'apps/web/src/components/v2/blocks'),
  join(ROOT, 'apps/web/src/components/v2/forms'),
  join(ROOT, 'apps/web/src/components/v2/status'),
  join(ROOT, 'apps/web/src/components/booking'),
];

const EXT = /\.(astro|tsx|ts|jsx|js)$/;
const SKIP_PATH = /(\.test\.|\.spec\.|node_modules|[\\/]dev[\\/])/;

const EXTRA_ALLOW = new Set([
  'astro-island',
  'cf-turnstile',
  'notice',
  'notice-danger',
  'error',
  'is-invalid', // booking / form field error outline (page or component CSS)
  'turnstile-slot',
  'v2-menu-nojs', // noscript menu fallback in SiteHeader
  // Non-v2 utilities used with data-v2-extra (booking-v2 / manage / corporate).
  'panel',
  'muted',
  'small',
  'input',
]);

/** Intentional extras with component/page CSS (booking-v2, WhatsApp, corporate). */
const EXTRA_PREFIXES = ['ep-', 'biz-'];

function collectCssClasses(css) {
  const out = new Set();
  for (const m of css.matchAll(/\.([A-Za-z_][\w-]*)/g)) out.add(m[1]);
  return out;
}

function walk(entry, files = []) {
  let st;
  try {
    st = statSync(entry);
  } catch {
    return files;
  }
  if (st.isFile()) {
    if (EXT.test(entry) && !SKIP_PATH.test(entry)) files.push(entry);
    return files;
  }
  for (const name of readdirSync(entry)) {
    const p = join(entry, name);
    if (SKIP_PATH.test(p)) continue;
    walk(p, files);
  }
  return files;
}

function addTokens(found, s) {
  for (const c of String(s).split(/\s+/)) {
    if (/^[A-Za-z_][\w-]*$/.test(c)) found.add(c);
  }
}

/** Pull class tokens only from class / className / class:list attributes. */
function extractClasses(source) {
  const found = new Set();
  // Strip comments so string literals inside them are ignored
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  for (const m of code.matchAll(/\b(?:class|className)\s*=\s*["']([^"']+)["']/g)) {
    addTokens(found, m[1]);
  }
  for (const m of code.matchAll(/\b(?:class|className)\s*=\s*\{\s*["']([^"']+)["']\s*\}/g)) {
    addTokens(found, m[1]);
  }
  for (const m of code.matchAll(/\b(?:class|className)\s*=\s*\{\s*`([^`$]*)`\s*\}/g)) {
    addTokens(found, m[1]);
  }
  // className={'a b'} or className={cond ? 'a' : 'b'} — not other string literals in the expr
  for (const m of code.matchAll(
    /\b(?:class|className)\s*=\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
  )) {
    const expr = m[1].trim();
    const pure = expr.match(/^['"]([^'"]+)['"]$/);
    if (pure) {
      addTokens(found, pure[1]);
      continue;
    }
    for (const sm of expr.matchAll(
      /\?[\s\n]*['"]([^'"]+)['"][\s\n]*:[\s\n]*['"]([^'"]+)['"]/g,
    )) {
      addTokens(found, sm[1]);
      addTokens(found, sm[2]);
    }
  }
  for (const m of code.matchAll(/class:list=\{\[([^\]]+)\]\}/gs)) {
    for (const sm of m[1].matchAll(/['"]([A-Za-z_][\w-]*)['"]/g)) found.add(sm[1]);
  }
  return found;
}

const css = readFileSync(V2_CSS, 'utf8');
const allowed = collectCssClasses(css);
for (const c of EXTRA_ALLOW) allowed.add(c);

const files = SCAN_ROOTS.flatMap((d) => walk(d));
const bad = [];

for (const file of files) {
  if (
    /[\\/]booking[\\/](api|reducer|format|types|turnstile)\./.test(file) ||
    /[\\/]booking[\\/]v2[\\/](journey|useHoldCountdown)\./.test(file)
  ) {
    continue;
  }
  const src = readFileSync(file, 'utf8');
  for (const c of extractClasses(src)) {
    if (c.startsWith('js-')) continue;
    if (allowed.has(c)) continue;
    if (EXTRA_PREFIXES.some((p) => c.startsWith(p))) continue;
    bad.push({ file: relative(ROOT, file).replaceAll('\\', '/'), className: c });
  }
}

if (bad.length) {
  console.error('Classes not in v2.css (and not js-*):');
  for (const b of bad) console.error(`  ${b.file}: .${b.className}`);
  process.exit(1);
}

console.log(`check-v2-classes: ok (${files.length} files, ${allowed.size} allowed tokens).`);
