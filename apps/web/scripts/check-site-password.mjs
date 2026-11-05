/**
 * Invokes apps/web/middleware.ts with synthetic Requests.
 * Usage: node apps/web/scripts/check-site-password.mjs
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { default: middleware } = await import(pathToFileURL(join(root, 'middleware.ts')).href);

function basic(user, pass) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

function req(path, authorization) {
  const headers = authorization ? { authorization } : undefined;
  return new Request(`https://example.test${path}`, { headers });
}

// --- SITE_PASSWORD unset: open ---
delete process.env.SITE_PASSWORD;
{
  const res = middleware(req('/'));
  assert.notEqual(res.status, 401, 'open site must not 401');
  assert.equal(res.headers.get('x-robots-tag'), null);
}

// --- SITE_PASSWORD set ---
process.env.SITE_PASSWORD = 'test';

{
  const res = middleware(req('/'));
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('www-authenticate'), 'Basic realm="Protected"');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
}

{
  const res = middleware(req('/', basic('user', 'wrong')));
  assert.equal(res.status, 401);
}

{
  const res = middleware(req('/', basic('ignored', 'test')));
  assert.notEqual(res.status, 401, 'correct password must pass');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
}

{
  const res = middleware(req('/api/webhooks/viva'));
  assert.notEqual(res.status, 401, 'viva webhook excluded');
}

{
  const res = middleware(req('/api/cron/reminders'));
  assert.notEqual(res.status, 401, 'cron excluded');
}

{
  const res = middleware(req('/api/internal/refund'));
  assert.notEqual(res.status, 401, 'internal api excluded');
}

{
  const res = middleware(req('/api/quote'));
  assert.equal(res.status, 401, 'public api still protected');
}

{
  const res = middleware(req('/images/v2/logo-white.png'));
  assert.notEqual(res.status, 401, 'email logo must be public');
}

{
  const res = middleware(req('/logo-white.png'));
  assert.notEqual(res.status, 401, 'legacy logo must be public');
}

{
  const res = middleware(req('/images/v2/other.png'));
  assert.equal(res.status, 401, 'other images stay protected');
}

delete process.env.SITE_PASSWORD;
console.log('check-site-password: ok');
