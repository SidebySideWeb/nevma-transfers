import { describe, expect, it } from 'vitest';
import { eurosDot, toCsv } from './export-csv';

describe('toCsv', () => {
  it('starts with UTF-8 BOM and uses semicolon separators', () => {
    const csv = toCsv(['Name', 'Amount (EUR)'], [['Alex', eurosDot(133912)]]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Name;Amount (EUR)');
    expect(csv).toContain('Alex;1339.12');
  });

  it('escapes quotes and semicolons', () => {
    const csv = toCsv(['Note'], [['say "hi"; then leave']]);
    expect(csv).toContain('"say ""hi""; then leave"');
  });
});
