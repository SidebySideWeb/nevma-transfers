import { defineField } from 'sanity';

// Every image in this Studio carries a required alt text.
export const altField = defineField({
  name: 'alt',
  title: 'Alt text',
  type: 'string',
  description: 'Describe the image for people who cannot see it. Required.',
  validation: (Rule) => Rule.required().max(200),
});

export const imageOptions = { hotspot: true } as const;
