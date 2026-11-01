import { describe, expect, it } from 'vitest';
import { confirmActionLabel } from './confirm-label';

describe('ConfirmDialog', () => {
  it('confirm label contains the formatted amount', () => {
    expect(confirmActionLabel('Refund', 1000)).toBe('Refund € 10.00');
    expect(confirmActionLabel('Cancel and refund', 22000)).toContain('€ 220.00');
  });
});
