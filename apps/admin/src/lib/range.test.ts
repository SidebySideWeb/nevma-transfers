import { describe, expect, it } from 'vitest';
import { parseTstzRange, rangesOverlap } from './range';

describe('parseTstzRange', () => {
  it('parses postgres range text', () => {
    const r = parseTstzRange('["2026-06-01T08:00:00+00","2026-06-01T10:00:00+00")');
    expect(r?.start.toISOString()).toBe('2026-06-01T08:00:00.000Z');
    expect(r?.end.toISOString()).toBe('2026-06-01T10:00:00.000Z');
  });

  it('detects overlap', () => {
    const a = parseTstzRange('["2026-06-01T08:00:00Z","2026-06-01T10:00:00Z")')!;
    const b = parseTstzRange('["2026-06-01T09:00:00Z","2026-06-01T11:00:00Z")')!;
    const c = parseTstzRange('["2026-06-01T10:00:00Z","2026-06-01T12:00:00Z")')!;
    expect(rangesOverlap(a, b)).toBe(true);
    expect(rangesOverlap(a, c)).toBe(false);
  });
});
