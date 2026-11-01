// Keeps the kit's docs, prompts and code in step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const prompts = readdirSync(join(root, 'prompts')).filter((f) => f.endsWith('.md')).sort();

test('31 prompts: 00 how-to plus 01..30 in the Nevma kit format', () => {
  assert.equal(prompts.length, 31);
  assert.equal(prompts[0], '00-HOW-TO-RUN.md');
  for (const [i, f] of prompts.slice(1).entries()) {
    assert.ok(f.startsWith(String(i + 1).padStart(2, '0') + '-'), f);
    const body = read(`prompts/${f}`);
    assert.match(body, /^# \d{2} — /m, `${f} title`);
    assert.match(body, /^Needs: /m, `${f} Needs`);
    assert.match(body, /^--- PROMPT ---$/m, `${f} marker`);
    assert.match(body, /^Check \(run and report pass\/fail\):$/m, `${f} Check`);
    assert.match(body, /^Commit: `[^`]+`$/m, `${f} Commit`);
    assert.match(body.split('--- PROMPT ---')[1], /Read `AGENTS\.md`/, `${f} starts from AGENTS.md`);
  }
});

test('every file path referenced in prompts, rules and AGENTS.md exists (or is built by a prompt)', () => {
  const sources = [...prompts.map((f) => `prompts/${f}`), 'AGENTS.md', ...readdirSync(join(root, '.cursor/rules')).map((f) => `.cursor/rules/${f}`)];
  const refs = new Set();
  for (const s of sources) for (const m of read(s).matchAll(/`((?:docs|design|packages\/db|seed|scripts|prompts|\.cursor\/rules)\/[\w./-]+\.(?:md|css|html|sql|mjs|mdc|ndjson|gz))`/g)) refs.add(m[1]);
  const builtLater = ['docs/QA-REPORT.md', 'scripts/check-live-demo.mjs'];
  for (const r of refs) if (!builtLater.includes(r)) assert.ok(existsSync(join(root, r)), `missing ${r}`);
});

test('every AC id used anywhere is defined in docs/ACCEPTANCE.md, and all 37 are used by a prompt', () => {
  const defined = new Set([...read('docs/ACCEPTANCE.md').matchAll(/^\| (AC-\d{2}) \|/gm)].map((m) => m[1]));
  assert.equal(defined.size, 37);
  const files = [...prompts.map((f) => `prompts/${f}`), 'docs/BOOKING-RULES.md', 'docs/DATA-MODEL.md', 'docs/FORMS.md', 'docs/superpowers/specs/2026-11-01-tem-protection-kit2-content-site.md'];
  const used = new Set();
  for (const f of files) for (const m of read(f).matchAll(/AC-\d{2}/g)) used.add(m[0]);
  for (const t of readdirSync(join(root, 'packages/db/tests'))) for (const m of read(`packages/db/tests/${t}`).matchAll(/AC-\d{2}/g)) used.add(m[0]);
  for (const id of used) assert.ok(defined.has(id), `${id} used but not defined`);
  const inPrompts = new Set();
  for (const f of prompts) for (const m of read(`prompts/${f}`).matchAll(/AC-\d{2}/g)) inPrompts.add(m[0]);
  for (const id of defined) assert.ok(inPrompts.has(id), `${id} not covered by any prompt`);
});

test('every table in the migrations is documented in docs/DATA-MODEL.md', () => {
  const doc = read('docs/DATA-MODEL.md');
  for (const f of readdirSync(join(root, 'packages/db/migrations'))) {
    for (const m of read(`packages/db/migrations/${f}`).matchAll(/create table public\.(\w+)/g)) assert.ok(doc.includes('`' + m[1] + '`'), `table ${m[1]} not documented`);
  }
});

test('every env var in .env.example is documented in docs/ARCHITECTURE.md', () => {
  const arch = read('docs/ARCHITECTURE.md');
  for (const m of read('.env.example').matchAll(/^([A-Z_]+)=/gm)) assert.ok(arch.includes(m[1]), `${m[1]} not in ARCHITECTURE.md`);
});

test('every screen named in docs/PAGES.md exists in design/screens or design/admin', () => {
  for (const m of read('docs/PAGES.md').matchAll(/`(design\/admin\/|design\/screens\/)?([\w-]+\.html)`/g)) {
    const dir = m[1] === 'design/admin/' ? 'design/admin' : 'design/screens';
    assert.ok(existsSync(join(root, dir, m[2])), `screen ${dir}/${m[2]} missing`);
  }
});

test('no NEVMA branding outside the decision history', () => {
  const scan = ['AGENTS.md', ...prompts.map((f) => `prompts/${f}`), 'docs/DESIGN-SYSTEM.md', 'docs/PAGES.md', 'docs/API.md', 'docs/FORMS.md', 'design/index.html'];
  for (const f of scan) assert.doesNotMatch(read(f).replace(/no NEVMA (branding|names|links)[^\n]*/gi, ''), /\bNEVMA\b(?! (branding|names|links|logos))/i, f);
});
