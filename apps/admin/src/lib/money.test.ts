import { describe, expect, it } from 'vitest';
import { centsToEuroInput, eurosToCents, optionalEurosToCents } from './money';

describe('eurosToCents', () => {
  it('converts 70.5 → 7050', () => {
    expect(eurosToCents('70.5')).toBe(7050);
  });

  it('converts 70.50 → 7050', () => {
    expect(eurosToCents('70.50')).toBe(7050);
  });

  it('rejects more than 2 decimal places (70.555)', () => {
    expect(() => eurosToCents('70.555')).toThrow('invalid_euros');
  });

  it('rejects empty', () => {
    expect(() => eurosToCents('')).toThrow('empty');
  });

  it('optional empty → null', () => {
    expect(optionalEurosToCents('')).toBeNull();
    expect(optionalEurosToCents('  ')).toBeNull();
  });

  it('centsToEuroInput round-trips', () => {
    expect(centsToEuroInput(7050)).toBe('70.50');
  });
});
