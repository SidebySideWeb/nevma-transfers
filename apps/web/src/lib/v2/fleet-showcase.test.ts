import { describe, expect, it } from 'vitest';
import { publishableKeysInOrder } from './fleet-showcase';

describe('fleet showcase publishable order', () => {
  it('keeps catalog order and drops classes missing from Sanity', () => {
    expect(
      publishableKeysInOrder(
        ['v-class', 'vito', 'e-class', 's-class', 'sprinter', 'limo'],
        ['vito', 'v-class', 'sprinter', 'e-class', 's-class'],
      ),
    ).toEqual(['v-class', 'vito', 'e-class', 's-class', 'sprinter']);
  });

  it('returns empty when Sanity has nothing publishable', () => {
    expect(publishableKeysInOrder(['v-class'], [])).toEqual([]);
  });
});
