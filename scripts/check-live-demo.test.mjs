import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-live-demo.mjs');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('AC-21 dry-run fails while DEMO seed/content is present', () => {
  const res = spawnSync(process.execPath, [script, '--dry-run'], {
    encoding: 'utf8',
    cwd: root,
    env: {
      ...process.env,
      // Force incomplete cloud config so Sanity/DB legs also report clearly without secrets.
      SANITY_PROJECT_ID: '',
      SANITY_DATASET: '',
      SANITY_READ_TOKEN: '',
      DATABASE_URL: '',
    },
  });
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /Launch guard failed/);
  assert.match(res.stdout, /DEMO placeholders remain|placeholders/);
  assert.doesNotMatch(res.stdout + res.stderr, /eyJ[A-Za-z0-9_-]{10,}/); // no JWT-looking dumps
});
