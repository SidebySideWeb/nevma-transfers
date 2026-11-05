import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relative-time';

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-12-01T12:00:00Z');

  it('formats minutes and hours ago', () => {
    expect(formatRelativeTime('2026-12-01T11:48:00Z', now)).toBe('12 min ago');
    expect(formatRelativeTime('2026-12-01T10:00:00Z', now)).toBe('2 hours ago');
    expect(formatRelativeTime('2026-12-01T11:59:30Z', now)).toBe('just now');
  });
});
