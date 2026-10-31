import { defineField, defineType } from 'sanity';
import { altField, imageOptions } from '../lib/imageWithAlt';

export const hero = defineType({
  name: 'hero',
  title: 'Hero',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'subheading', title: 'Subheading', type: 'text', rows: 3 }),
    defineField({ name: 'image', title: 'Image', type: 'image', options: imageOptions, fields: [altField] }),
    defineField({ name: 'ctaLabel', title: 'Button label', type: 'string' }),
    defineField({
      name: 'ctaTarget',
      title: 'Button goes to',
      type: 'string',
      options: { list: [{ title: 'Booking page', value: 'book' }, { title: 'Other link', value: 'url' }], layout: 'radio' },
      initialValue: 'book',
    }),
    defineField({ name: 'ctaUrl', title: 'Other link', type: 'url', hidden: ({ parent }) => parent?.ctaTarget !== 'url' }),
  ],
  preview: { select: { title: 'heading', media: 'image' }, prepare: ({ title, media }) => ({ title: title ?? 'Hero', subtitle: 'Hero', media }) },
});
