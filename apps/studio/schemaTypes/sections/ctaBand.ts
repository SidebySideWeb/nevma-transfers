import { defineField, defineType } from 'sanity';
import { ctaUrlField } from '../lib/ctaUrl';

export const ctaBand = defineType({
  name: 'ctaBand',
  title: 'Call to action band',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'text', title: 'Text', type: 'text', rows: 2 }),
    defineField({ name: 'ctaLabel', title: 'Button label', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({
      name: 'ctaTarget',
      title: 'Button goes to',
      type: 'string',
      options: {
        list: [
          { title: 'Booking page', value: 'book' },
          { title: 'Request a quote', value: 'quote' },
          { title: 'Other link', value: 'url' },
        ],
        layout: 'radio',
      },
      initialValue: 'book',
    }),
    ctaUrlField,
  ],
  preview: { select: { title: 'heading' }, prepare: ({ title }) => ({ title: title ?? 'Call to action', subtitle: 'Call to action band' }) },
});
