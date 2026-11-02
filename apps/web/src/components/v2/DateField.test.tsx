import { describe, expect, it } from 'vitest';
import { ddMmYyyyToIso, isoToDdMmYyyy } from './DateField';

describe('DateField format', () => {
  it('formats ISO as dd/mm/yyyy', () => {
    expect(isoToDdMmYyyy('2026-11-17')).toBe('17/11/2026');
    expect(isoToDdMmYyyy('')).toBe('');
    expect(isoToDdMmYyyy('bad')).toBe('');
  });

  it('parses dd/mm/yyyy to ISO', () => {
    expect(ddMmYyyyToIso('17/11/2026')).toBe('2026-11-17');
    expect(ddMmYyyyToIso('7/3/2026')).toBe('2026-03-07');
    expect(ddMmYyyyToIso('31/02/2026')).toBe('');
    expect(ddMmYyyyToIso('not-a-date')).toBe('');
  });
});
