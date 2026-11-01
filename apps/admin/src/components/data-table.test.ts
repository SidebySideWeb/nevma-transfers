import { describe, expect, it } from 'vitest';
import { cellsHaveDataLabels, tableCell } from './data-table';

describe('DataTable', () => {
  it('every cell carries data-label', () => {
    const cells = [
      { 'data-label': 'Reference' },
      { 'data-label': 'Pick-up' },
      { 'data-label': 'Total' },
    ];
    expect(cellsHaveDataLabels(cells)).toBe(true);
    expect(cellsHaveDataLabels([{ 'data-label': '' }])).toBe(false);
    expect(cellsHaveDataLabels([])).toBe(false);

    const html = tableCell('Total', '€ 10.00', { className: 'num' });
    expect(html).toContain('data-label="Total"');
    expect(html).toContain('class="num"');
  });
});
