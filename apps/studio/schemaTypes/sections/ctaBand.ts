import { defineField, defineType } from 'sanity';

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
      options: { list: [{ title: 'Booking page', value: 'book' }, { title: 'Other link', value: 'url' }], layout: 'radio' },
      initialValue: 'book',
    }),
    defineField({ name: 'ctaUrl', title: 'Other link', type: 'url', hidden: ({ parent }) => parent?.ctaTarget !== 'url' }),
  ],
  preview: { select: { title: 'heading' }, prepare: ({ title }) => ({ title: title ?? 'Call to action', subtitle: 'Call to action band' }) },
});
