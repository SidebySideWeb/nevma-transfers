import { describe, expect, it } from 'vitest';
import { buildWorkbook, readAmountAndDateCells } from './export-excel';

describe('buildWorkbook', () => {
  it('stores amounts as numbers and dates as dates', async () => {
    const buf = await buildWorkbook({
      sheetName: 'Driver pay 2026-11',
      columns: [
        { header: 'Driver', type: 'text', width: 20 },
        { header: 'Day', type: 'date', width: 12 },
        { header: 'Owed', type: 'number', width: 12 },
      ],
      rows: [['Alex Driver', new Date(Date.UTC(2026, 10, 1)), 1642.5]],
    });
    const { amounts, dates } = await readAmountAndDateCells(buf);
    expect(amounts).toContain(1642.5);
    expect(dates.length).toBeGreaterThanOrEqual(1);
    expect(dates[0]!.getUTCFullYear()).toBe(2026);
  });
});
