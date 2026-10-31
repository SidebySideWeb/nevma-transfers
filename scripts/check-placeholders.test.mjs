import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-placeholders.mjs');

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'tem-ph-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

function run(root) {
  return spawnSync('node', [script, '--root', root], { encoding: 'utf8' });
}

test('exits 1 and prints the path when a seed file contains DEMO', () => {
  const root = tree({ 'seed/x.json': '{"label":"DEMO"}' });
  const res = run(root);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /seed[\\/]x\.json/);
});

test('exits 0 on a clean tree', () => {
  const root = tree({ 'seed/x.json': '{"label":"Airport transfer"}', 'apps/web/src/a.ts': 'export const a = 1;' });
  assert.equal(run(root).status, 0);
});

test('ignores node_modules and finds DEMO under apps/*/src and packages/db/seed', () => {
  const ignored = tree({ 'seed/node_modules/pkg/x.json': 'DEMO' });
  assert.equal(run(ignored).status, 0);
  const srcHit = tree({ 'apps/web/src/lib/x.ts': "const n = 'DEMO price';" });
  assert.equal(run(srcHit).status, 1);
  const sqlHit = tree({ 'packages/db/seed/demo.sql': "insert into zones values ('DEMO airport');" });
  assert.equal(run(sqlHit).status, 1);
});
