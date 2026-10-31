import { describe, expect, it } from 'vitest';
import { localToInstant } from './time';
import { blockedRange } from './range';

describe('AC-14 blocked ranges', () => {
  it('AC-14: blockedRange across 25 Oct 2026 02:30 +03:00 for 180m + 30 buffer spans exactly 4 hours', () => {
    const pickup = localToInstant('2026-10-25T02:30', 'Europe/Athens');
    // 02:30 on that morning is before the fold-back; only one instant (+03:00).
    expect(pickup.toISOString()).toBe('2026-10-24T23:30:00.000Z');

    const { start, end } = blockedRange(pickup, 180, 30);
    expect(end.getTime() - start.getTime()).toBe(4 * 60 * 60 * 1000);
    expect(start.toISOString()).toBe(new Date(pickup.getTime() - 30 * 60_000).toISOString());
    expect(end.toISOString()).toBe(new Date(pickup.getTime() + 210 * 60_000).toISOString());
  });
});
