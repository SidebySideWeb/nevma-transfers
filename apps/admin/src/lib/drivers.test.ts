import { describe, expect, it } from 'vitest';
import { driversEnabled } from './drivers';

describe('driversEnabled', () => {
  it('defaults to false', () => {
    expect(driversEnabled(undefined)).toBe(false);
    expect(driversEnabled('')).toBe(false);
    expect(driversEnabled('false')).toBe(false);
  });

  it('is true only for true / "true"', () => {
    expect(driversEnabled(true)).toBe(true);
    expect(driversEnabled('true')).toBe(true);
    expect(driversEnabled('TRUE')).toBe(false);
  });
});
