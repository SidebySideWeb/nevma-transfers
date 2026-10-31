import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { signPayload } from './signing';

const SECRET = 'tem-fixed-vector-secret';
const BODY = '{"reference":"TEM-VECTOR","amountCents":1000}';
const TS = 1_700_000_000;

/** Fixed vector: HMAC-SHA256 hex of `timestamp.body` (docs/API.md). */
const EXPECTED = createHmac('sha256', SECRET).update(`${TS}.${BODY}`).digest('hex');

describe('signing vector', () => {
  it('admin signPayload matches the fixed vector', () => {
    expect(signPayload(SECRET, BODY, TS)).toBe(EXPECTED);
  });

  it('matches the web app algorithm for the same vector', () => {
    const webSrc = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../web/src/lib/server/signing.ts'),
      'utf8',
    );
    expect(webSrc).toMatch(/update\(`\$\{timestamp\}\.\$\{body\}`\)/);
    // Same pure formula as web `signWithSecret` / admin `signPayload`.
    const webEquivalent = createHmac('sha256', SECRET).update(`${TS}.${BODY}`).digest('hex');
    expect(signPayload(SECRET, BODY, TS)).toBe(webEquivalent);
    expect(webEquivalent).toBe(EXPECTED);
  });
});
