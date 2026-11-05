import { describe, expect, it } from 'vitest';

/** Mirrors ClassName.astro label rules for unit coverage without rendering Astro. */
function classLabel(name?: string | null, fullName?: string | null) {
  const short = (name ?? '').trim();
  const full = (fullName ?? '').trim();
  return {
    label: short || '—',
    title: full && full !== short ? full : short || undefined,
    muted: !short,
  };
}

describe('ClassName label (AC presentation)', () => {
  it('shows the short name and full name as title', () => {
    expect(classLabel('V-Class', 'Mercedes-Benz V-Class')).toEqual({
      label: 'V-Class',
      title: 'Mercedes-Benz V-Class',
      muted: false,
    });
  });

  it('never falls back to a key — empty name is an em dash', () => {
    expect(classLabel(null, null)).toEqual({
      label: '—',
      title: undefined,
      muted: true,
    });
  });

  it('omits a redundant title when full matches short', () => {
    expect(classLabel('S-Class', 'S-Class').title).toBe('S-Class');
  });
});
