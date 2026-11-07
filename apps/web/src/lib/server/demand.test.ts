import { describe, expect, it } from 'vitest';
import { publicBreakdown } from './demand';

describe('publicBreakdown', () => {
  it('strips High demand lines from customer-facing breakdown', () => {
    const lines = [
      { code: 'base_fare', label: 'Base fare', amount: 4000 },
      { code: 'demand', label: 'High demand', amount: 400 },
      { code: 'rounding', label: 'Rounding', amount: 0 },
    ];
    expect(publicBreakdown(lines).map((l) => l.code)).toEqual(['base_fare', 'rounding']);
  });
});
