// Checks that the Sanity seed carries every line of text of the V2 design content pages,
// block by block, and that the static V2 build is complete.
// Design text: design/v2/build/text.json (generated from design/v2/build/*.html by design/v2/tools).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'design', 'v2', 'build');
const text = JSON.parse(readFileSync(join(build, 'text.json'), 'utf8'));
const docs = readFileSync(join(root, 'seed', 'sanity', 'data.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const norm = (s) => s.replace(/[’']/g, "'").replace(/[“”]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Every string in a document; portable-text blocks are joined into one line as well.
function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') {
    if (v._type === 'block' && Array.isArray(v.children)) out.push(v.children.map((c) => c.text).join(''));
    for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) strings(x, out);
  }
  return out;
}

// Pages whose text lives in Sanity page documents, and the seeded page that carries it.
const CONTENT = {
  '01-home': ['page-home'], '02-fleet': ['page-fleet'], '03-vehicle': ['page-vehicle'], '04-services': ['page-services'],
  '05-vip-security': ['page-vip-security'], '06-about': ['page-about'], '07-contact': ['page-contact'],
  '12-request-transfer': ['page-request-a-transfer'],
  '17-legal': ['page-legal', 'page-terms', 'page-cancellation', 'page-privacy', 'page-cookies'],
};
// Blocks whose text comes from elsewhere: vehicle classes and prices (database), site settings,
// form fields (form documents + uiStrings), or the shared header and footer (uiStrings).
const FROM_ELSEWHERE = new Set(['siteHeader', 'siteFooter', 'vehicleTabs', 'vehicleHero']);
const vehicleText = new Set(docs.filter((d) => d._type === 'vehicleClass').flatMap((d) => strings(d)).map(norm));
const settings = docs.find((d) => d._id === 'siteSettings');
// Lines that are data, symbols, or intentionally reworded (final prices with VAT included).
const DYNAMIC = [
  /^[€+−\-–—→←↓⇄▾◦✓§·.,:/()*]*$/u, /^€\s?[\d.,[\]a-z]+/i, /^\d+$/, /^[ivx]+\.$/, /^0\d$/, /^\d+ \/ \d+$/, /^\(\d\)$/,
  /^up to \d+/i, /exclusive of 24% vat|excl\. 24% vat/i, /^from €\d+/i, /^min \d+h$/i, /^\/h · min \d+h$/i, /^\d hours$/,
  /^All prices are quoted in euros \(€\) and are$/, /^athens( international airport \(aia\))?$/i, /^book the [a-z-]+$/i, /^airport · one way$|^hourly · min \d hours$/i, /^seats\*$|^luggage\*$|^airport$|^hourly$/i,
];
const fieldLabels = /^(full name|email|phone|phone \(optional\)|mobile phone|service|date|place|message|topic|i agree that|privacy policy|send |pick-up|drop-off|flight|passengers|luggage|preferred vehicle|no preference|optional|add a vip security escort|we plan the escort|anything else|i need an invoice|journey|service & vehicle|your details|one-off transfer|close protection|vip transfer|athens|\.$|send request|send enquiry|send message)/i;

for (const [page, ids] of Object.entries(CONTENT)) {
  test(`${page}: every design line is in the Sanity seed`, () => {
    const pool = ids.flatMap((id) => {
      const d = docs.find((x) => x._id === id);
      assert.ok(d, `seed has ${id}`);
      return strings(d);
    }).map(norm);
    const hay = pool.join('\n');
    const missing = [];
    for (const b of text[page]) {
      if (FROM_ELSEWHERE.has(b.block)) continue;
      for (const line of b.lines) {
        const n = norm(line);
        if (hay.includes(n) || vehicleText.has(n)) continue;
        if (DYNAMIC.some((r) => r.test(line))) continue;
        if (Object.values(settings).some((v) => typeof v === 'string' && norm(v) === n)) continue;
        if (b.block === 'enquiryForm' && fieldLabels.test(line)) continue;
        if (b.block === 'pageHero' && /^(see prices|from|to|date|time|passengers)$/i.test(line)) continue; // quick-booking widget: site.quick.* uiStrings
        missing.push(`${b.block}: ${line}`);
      }
    }
    assert.deepEqual(missing, []);
  });
}

test('every seeded V2 page keeps the block order of its design page', () => {
  const order = (page) => text[page].map((b) => b.block).filter((b) => !FROM_ELSEWHERE.has(b));
  for (const [page, [id]] of Object.entries(CONTENT)) {
    const d = docs.find((x) => x._id === id);
    const seeded = d.sections.map((s) => s._type);
    const design = order(page);
    if (page === '17-legal') { assert.deepEqual(seeded, ['pageHero']); continue; }
    assert.deepEqual(seeded, design, page);
  }
});

test('the static V2 build has every design page and state, one stylesheet and no runtime', () => {
  const files = readdirSync(build).filter((f) => f.endsWith('.html'));
  for (const n of ['01-home', '02-fleet', '03-vehicle', '04-services', '05-vip-security', '06-about', '07-contact', '08-book', '08-book-2',
    '08-book-3', '08-book-3-options', '08-book-4', '08-book-4-viva', '09-thank-you', '10-payment-failed', '11-hold-expired',
    '12-request-transfer', '13-request-received', '14-find-my-booking', '15-manage-booking', '16-cancel-booking', '17-legal', '01-home-navopen', '08-book-1-open']) {
    assert.ok(files.includes(`${n}.html`), n);
  }
  assert.ok(existsSync(join(build, 'v2.css')));
  for (const f of files) {
    const html = readFileSync(join(build, f), 'utf8');
    assert.doesNotMatch(html, /<script|runtime\.js|\sstyle="/, f);
    assert.match(html, /data-block="/, f);
  }
});

// ---- app pages (booking flow, returns, lookup, manage) and the shared header, footer and vehicle page ----
const uiSrc = readFileSync(join(root, 'apps', 'studio', 'schemaTypes', 'lib', 'uiStringDefaults.ts'), 'utf8');
const uiValues = [...uiSrc.matchAll(/value: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
// Literal pieces of every string, with {placeholders} and *accent markers* removed.
const uiPieces = uiValues.flatMap((v) => v.replace(/\*/g, '').split(/\{[a-zA-Z]+\}/)).map(norm).filter(Boolean);
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uiRegexes = uiValues.map((v) => new RegExp('^' + v.replace(/\*/g, '').split(/\{[a-zA-Z]+\}/).map((x) => esc(norm(x))).join('.+') + '$'));
const inUi = (line) => {
  const n = norm(line).replace(/^[←✓+]\s*|\s*[→]$/gu, '').replace(/^[.,]\s*|\s*[.,]$/g, '');
  return !n || uiPieces.some((p) => p.includes(n)) || uiRegexes.some((r) => r.test(n) || r.test(norm(line)));
};
// Booking data shown in the design as sample values.
const SAMPLE = [/^EP-\d{4}-\d{4}/, /^\[[^\]]+\]/, /^(tue|mon|wed|thu|fri|sat|sun) \d+ \w+ \d{4}/i, /^\d\d:\d\d$/, /held for$/i, /·\s*[A-Z-]+$/,
  /^(mercedes-benz )?[a-z]-class|^vito|^sprinter|^v-class/i, /pieces$|^flight /i, /^confirmed$|^status$/i, /→/, /^\+30|@eliteprotection\.gr$/,
  /^prototype: choose the viva outcome$|^payment (succeeds|fails)$/i, /^(luxury van|van|saloon|executive saloon|vip van)$/i,
  /^vat 24%$|^total$|transfer$/i, /^\d \. \d$|^\d · \d$/, /^\+ €/, /^\d\.$/, /^journey|^vehicle|^lead passenger|^invoice$/i];
const APP = ['08-book', '08-book-2', '08-book-3-options', '08-book-4', '08-book-4-viva', '09-thank-you', '10-payment-failed', '11-hold-expired',
  '13-request-received', '14-find-my-booking', '15-manage-booking', '16-cancel-booking'];
for (const page of APP) {
  test(`${page}: every design line is a uiStrings default or booking data`, () => {
    const missing = [];
    for (const b of text[page]) for (const line of b.lines) {
      if (inUi(line) || DYNAMIC.some((r) => r.test(line)) || SAMPLE.some((r) => r.test(line))) continue;
      missing.push(`${b.block}: ${line}`);
    }
    assert.deepEqual(missing, []);
  });
}
test('shared header, footer and vehicle page lines are uiStrings defaults or vehicle data', () => {
  const missing = [];
  for (const page of ['01-home', '03-vehicle']) for (const b of text[page]) {
    if (!['siteFooter', 'vehicleTabs', 'vehicleHero', 'siteHeader'].includes(b.block)) continue;
    for (const line of b.lines) {
      if (inUi(line) || vehicleText.has(norm(line)) || DYNAMIC.some((r) => r.test(line)) || SAMPLE.some((r) => r.test(line))) continue;
      missing.push(`${b.block}: ${line}`);
    }
  }
  assert.deepEqual(missing, []);
});
