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

/** Same as actions/index.ts optionalFormUuid — create forms may send null. */
const optionalFormUuid = z.union([z.string().uuid(), z.literal(''), z.null()]).optional();

const saveCompanyInput = z.object({
  id: optionalFormUuid,
  name: z.string().trim().min(1).max(200),
  kind: z.enum(['hotel', 'agency', 'company']),
  paymentTermsDays: z.coerce.number().int().min(1).max(365),
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

  it('saveCompany accepts null/empty/missing id for create', () => {
    const base = { name: 'Acme', kind: 'company' as const, paymentTermsDays: 30 };
    expect(saveCompanyInput.safeParse({ ...base, id: null }).success).toBe(true);
    expect(saveCompanyInput.safeParse({ ...base, id: '' }).success).toBe(true);
    expect(saveCompanyInput.safeParse(base).success).toBe(true);
    expect(
      saveCompanyInput.safeParse({
        ...base,
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      }).success,
    ).toBe(true);
  });
});
