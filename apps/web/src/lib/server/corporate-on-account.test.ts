import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  bookingDb: vi.fn(),
}));

describe('B9 on-account guards', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('refuses when pay_on_account is false', async () => {
    const { assertOnAccountAllowed } = await import('./corporate');
    await expect(
      assertOnAccountAllowed(
        {
          companyId: 'c1',
          payOnAccount: false,
          creditLimitCents: 100_000,
        },
        1000,
      ),
    ).rejects.toMatchObject({ message: 'on_account_not_allowed' });
  });

  it('refuses above the credit limit', async () => {
    const { bookingDb } = await import('./db');
    vi.mocked(bookingDb).mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [{ n: 40_000 }] }),
    } as never);
    const { assertOnAccountAllowed } = await import('./corporate');
    await expect(
      assertOnAccountAllowed(
        {
          companyId: 'c1',
          payOnAccount: true,
          creditLimitCents: 50_000,
        },
        15_000,
      ),
    ).rejects.toMatchObject({ message: 'credit_limit' });
  });

  it('allows when under the credit limit or unlimited', async () => {
    const { bookingDb } = await import('./db');
    vi.mocked(bookingDb).mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [{ n: 10_000 }] }),
    } as never);
    const { assertOnAccountAllowed } = await import('./corporate');
    await expect(
      assertOnAccountAllowed(
        { companyId: 'c1', payOnAccount: true, creditLimitCents: 50_000 },
        5_000,
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertOnAccountAllowed(
        { companyId: 'c1', payOnAccount: true, creditLimitCents: null },
        999_999,
      ),
    ).resolves.toBeUndefined();
  });
});
