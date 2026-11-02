import { afterEach, describe, expect, it } from 'vitest';
import { driversEnabled } from './drivers';

describe('driversEnabled', () => {
  const prev = process.env.FEATURE_DRIVERS;

  afterEach(() => {
    if (prev === undefined) delete process.env.FEATURE_DRIVERS;
    else process.env.FEATURE_DRIVERS = prev;
  });

  it('defaults to false', () => {
    delete process.env.FEATURE_DRIVERS;
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
