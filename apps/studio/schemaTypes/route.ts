import { defineArrayMember, defineField, defineType } from 'sanity';
import { altField, imageOptions } from './lib/imageWithAlt';
import { validateCode } from './lib/code';

export const route = defineType({
  name: 'route',
  title: 'Route',
  type: 'document',
  description: 'A landing page for one trip, for example Athens Airport to Piraeus. Prices and duration come from the booking system by zone code.',
  fields: [
    defineField({ name: 'title', title: 'Title', type: 'string', description: 'For example "Athens Airport to Piraeus port"', validation: (Rule) => Rule.required() }),
    defineField({ name: 'slug', title: 'URL slug', type: 'slug', options: { source: 'title', maxLength: 80 }, validation: (Rule) => Rule.required() }),
    defineField({
      name: 'fromZone',
      title: 'From zone code',
      type: 'string',
      description: 'Exactly as in the admin app, for example demo-airport.',
      validation: (Rule) => Rule.required().custom(validateCode),
    }),
    defineField({
      name: 'toZone',
      title: 'To zone code',
      type: 'string',
      validation: (Rule) =>
        Rule.required().custom((value, ctx) => {
          const ok = validateCode(value);
          if (ok !== true) return ok;
          return value === (ctx.document as { fromZone?: string } | undefined)?.fromZone ? 'From and to must be different zones' : true;
        }),
    }),
    defineField({ name: 'intro', title: 'Intro', type: 'text', rows: 3, validation: (Rule) => Rule.required() }),
    defineField({
      name: 'body',
      title: 'Text',
      type: 'array',
      of: [defineArrayMember({ type: 'block', styles: [{ title: 'Normal', value: 'normal' }, { title: 'Subheading', value: 'h3' }], lists: [{ title: 'Bullet', value: 'bullet' }], marks: { decorators: [{ title: 'Strong', value: 'strong' }, { title: 'Emphasis', value: 'em' }], annotations: [] } })],
    }),
    defineField({ name: 'photo', title: 'Photo', type: 'image', options: imageOptions, fields: [altField] }),
    defineField({
      name: 'faq',
      title: 'Questions',
      type: 'array',
      of: [defineArrayMember({
        type: 'object',
        name: 'faqItem',
        fields: [
          defineField({ name: 'question', title: 'Question', type: 'string', validation: (Rule) => Rule.required() }),
          defineField({ name: 'answer', title: 'Answer', type: 'text', rows: 3, validation: (Rule) => Rule.required() }),
        ],
        preview: { select: { title: 'question' } },
      })],
    }),
    defineField({ name: 'featured', title: 'Featured (shown in route lists by default)', type: 'boolean', initialValue: false }),
    defineField({ name: 'sortOrder', title: 'Sort order', type: 'number', initialValue: 100 }),
    defineField({ name: 'seo', title: 'SEO', type: 'seo' }),
    defineField({ name: 'internalNote', title: 'Internal note (never shown on the site)', type: 'string' }),
  ],
  orderings: [{ title: 'Sort order', name: 'sortOrder', by: [{ field: 'sortOrder', direction: 'asc' }] }],
  preview: { select: { title: 'title', from: 'fromZone', to: 'toZone', media: 'photo' }, prepare: ({ title, from, to, media }) => ({ title, subtitle: `${from} → ${to}`, media }) },
});
