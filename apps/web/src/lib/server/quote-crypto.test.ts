import { describe, expect, it } from 'vitest';
import { signQuote, verifyQuoteSignature } from './quote-crypto';

describe('quote signature', () => {
  const secret = 'test-secret';
  const id = '11111111-1111-4111-8111-111111111111';
  const exp = '2026-11-07T12:00:00.000Z';

  it('round-trips', () => {
    const sig = signQuote(secret, id, exp);
    expect(verifyQuoteSignature(secret, id, exp, sig)).toBe(true);
  });

  it('rejects tampering', () => {
    const sig = signQuote(secret, id, exp);
    expect(verifyQuoteSignature(secret, id, exp, sig.replace(/0/g, '1'))).toBe(false);
    expect(verifyQuoteSignature(secret, id, '2026-11-07T12:00:01.000Z', sig)).toBe(false);
    expect(verifyQuoteSignature('other', id, exp, sig)).toBe(false);
  });
});
