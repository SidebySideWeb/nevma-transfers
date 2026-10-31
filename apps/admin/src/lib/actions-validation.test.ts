import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { eurosToCents } from './money';

/** Mirror of action input schemas used to reject invalid admin forms. */
const refundInput = z.object({
  reference: z.string().min(1),
  amountEuros: z.string().min(1),
  reason: z.string().min(1),
  idempotencyKey: z.string().uuid(),
});

const assignInput = z.object({
  reference: z.string().min(1),
  vehicleId: z.string().uuid().optional().or(z.literal('')),
});

describe('action input validation', () => {
  it('rejects refund without idempotency uuid', () => {
    const r = refundInput.safeParse({
      reference: 'TEM-1',
      amountEuros: '10',
      reason: 'x',
      idempotencyKey: 'not-a-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty reference on assign', () => {
    const r = assignInput.safeParse({ reference: '', vehicleId: '' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid euro amount before calling internal API', () => {
    expect(() => eurosToCents('abc')).toThrow();
    expect(() => eurosToCents('10.999')).toThrow();
  });
});
