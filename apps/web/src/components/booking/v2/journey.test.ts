import { describe, expect, it } from 'vitest';
import { isPickupLocal, joinLocal } from './journey';

describe('joinLocal / isPickupLocal', () => {
  it('joins date and time as YYYY-MM-DDTHH:mm', () => {
    expect(joinLocal('2026-11-05', '10:00')).toBe('2026-11-05T10:00');
    expect(isPickupLocal('2026-11-05T10:00')).toBe(true);
  });

  it('strips seconds from browser time values', () => {
    expect(joinLocal('2026-11-05', '10:00:00')).toBe('2026-11-05T10:00');
  });

  it('rejects empty or partial pickupLocal', () => {
    expect(isPickupLocal('')).toBe(false);
    expect(isPickupLocal('2026-11-05T')).toBe(false);
    expect(isPickupLocal('T10:00')).toBe(false);
    expect(isPickupLocal('2026-11-05T10:00:00')).toBe(false);
  });
});
