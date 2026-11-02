import { describe, expect, it } from 'vitest';
import {
  adjustmentAmountCents,
  bpToPercentInput,
  endPreviousPlanOn,
  eurosOrZero,
  percentToBp,
} from './pay-convert';

describe('percentToBp', () => {
  it('converts whole and fractional percents to basis points', () => {
    expect(percentToBp('10')).toBe(1000);
    expect(percentToBp('10.5')).toBe(1050);
    expect(percentToBp('0')).toBe(0);
    expect(percentToBp('')).toBe(0);
  });

  it('rejects out of range', () => {
    expect(() => percentToBp('100.01')).toThrow('invalid_percent');
    expect(() => percentToBp('-1')).toThrow('invalid_percent');
  });
});

describe('bpToPercentInput', () => {
  it('round-trips common values', () => {
    expect(bpToPercentInput(1000)).toBe('10');
    expect(bpToPercentInput(1050)).toBe('10.5');
  });
});

describe('eurosOrZero', () => {
  it('parses euros and empty to cents', () => {
    expect(eurosOrZero('')).toBe(0);
    expect(eurosOrZero('15.50')).toBe(1550);
  });
});

describe('adjustmentAmountCents', () => {
  it('stores tip positive and deduction/advance negative', () => {
    expect(adjustmentAmountCents('tip', '10.00')).toBe(1000);
    expect(adjustmentAmountCents('deduction', '5')).toBe(-500);
    expect(adjustmentAmountCents('advance', '50.00')).toBe(-5000);
  });
});

describe('endPreviousPlanOn', () => {
  it('ends the previous plan the day before valid_from', () => {
    expect(endPreviousPlanOn('2027-01-01')).toBe('2026-12-31');
    expect(endPreviousPlanOn('2026-03-01')).toBe('2026-02-28');
  });
});
