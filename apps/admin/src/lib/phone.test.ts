import { describe, expect, it } from 'vitest';
import { formatPhone, phoneTelHref } from './phone';

describe('phone', () => {
  it('formats Greek mobiles with +30 and spaced groups', () => {
    expect(formatPhone('6947333086')).toBe('+30 694 733 3086');
    expect(formatPhone('+30 694 733 3086')).toBe('+30 694 733 3086');
    expect(formatPhone('00306947333086')).toBe('+30 694 733 3086');
    expect(formatPhone('06947333086')).toBe('+30 694 733 3086');
  });

  it('builds tel: hrefs and treats empty as null', () => {
    expect(phoneTelHref('6947333086')).toBe('tel:+306947333086');
    expect(formatPhone('')).toBeNull();
    expect(formatPhone(null)).toBeNull();
  });
});
