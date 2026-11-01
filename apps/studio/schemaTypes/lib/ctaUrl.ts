import { defineField } from 'sanity';

/** CTA “Other link”: paths, absolute URLs, or on-page anchors like `#enquiry` (VIP form). */
export const ctaUrlField = defineField({
  name: 'ctaUrl',
  title: 'Other link',
  type: 'string',
  description: 'A path (/contact), a full URL, or an on-page anchor (#enquiry)',
  validation: (Rule) =>
    Rule.custom((value) => {
      if (value == null || value === '') return true;
      if (typeof value !== 'string') return 'Invalid link';
      if (value.startsWith('#')) {
        return /^#[A-Za-z][\w-]*$/.test(value) || 'Use an anchor like #enquiry';
      }
      if (value.startsWith('/')) return true;
      try {
        const u = new URL(value);
        if (['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) return true;
      } catch {
        /* not an absolute URL */
      }
      return 'Use a path (/…), an anchor (#…), or http(s)/mailto/tel';
    }),
  hidden: ({ parent }) => parent?.ctaTarget !== 'url',
});
