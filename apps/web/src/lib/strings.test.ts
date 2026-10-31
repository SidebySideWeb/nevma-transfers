import { afterEach, describe, expect, it } from 'vitest';
import { clearStringOverrides, setStringOverrides, t, type UiStringKey } from './strings';

afterEach(() => {
  clearStringOverrides();
});

describe('t()', () => {
  it('uses the code default when Sanity has no value', () => {
    expect(t('booking.search.title')).toBe('Book your ride');
  });

  it('lets a Sanity value win over the default', () => {
    setStringOverrides({ 'booking.search.title': 'Reserve your transfer' });
    expect(t('booking.search.title')).toBe('Reserve your transfer');
  });

  it('fills placeholders from vars', () => {
    expect(t('booking.hours.hint', { min: 3, max: 12 })).toBe(
      'Minimum 3 hours, maximum 12 hours.',
    );
  });

  it('throws in tests when a placeholder variable is missing', () => {
    expect(() => t('booking.hours.hint', { min: 3 })).toThrow(/Missing placeholder variable: max/);
  });

  it('rejects an unknown key at the type level', () => {
    // @ts-expect-error unknown ui string key
    const key: UiStringKey = 'booking.not.a.real.key';
    void key;
  });
});
