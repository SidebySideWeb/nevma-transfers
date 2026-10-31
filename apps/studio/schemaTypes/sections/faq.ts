import { defineArrayMember, defineField, defineType } from 'sanity';

export const faq = defineType({
  name: 'faq',
  title: 'FAQ',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string' }),
    defineField({
      name: 'items',
      title: 'Questions',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'faqItem',
          fields: [
            defineField({ name: 'question', title: 'Question', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'answer', title: 'Answer', type: 'text', rows: 3, validation: (Rule) => Rule.required() }),
          ],
          preview: { select: { title: 'question' } },
        }),
      ],
      validation: (Rule) => Rule.min(1),
    }),
  ],
  preview: { select: { title: 'heading' }, prepare: ({ title }) => ({ title: title ?? 'FAQ', subtitle: 'FAQ' }) },
});
