import { describe, expect, it } from 'vitest';
import { linesBeforeVat } from './vat-lines';

describe('AC-37 linesBeforeVat', () => {
  it('splits 220.00 at 24% into 177.42 + 42.58', () => {
    const out = linesBeforeVat([{ label: 'V-Class', cents: 22000 }], 2400, 4258, 22000);
    expect(out).toEqual([{ label: 'V-Class', cents: 17742 }]);
  });

  it('items plus VAT always equal the total (rounding goes to the last item)', () => {
    const lines = [
      { label: 'V-Class', cents: 22320 },
      { label: 'Child seat', cents: 1000 },
    ];
    const out = linesBeforeVat(lines, 2400, 4503, 23320);
    expect(out.reduce((s, l) => s + l.cents, 0) + 4503).toBe(23320);
  });
});
