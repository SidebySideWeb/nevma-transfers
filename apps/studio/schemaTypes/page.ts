import { defineArrayMember, defineField, defineType } from 'sanity';

export const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({
      name: 'kind',
      title: 'Kind',
      type: 'string',
      options: {
        list: [
          { title: 'Home', value: 'home' },
          { title: 'Legal', value: 'legal' },
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({
      name: 'slug',
      title: 'URL slug',
      type: 'slug',
      options: { source: 'title', maxLength: 64 },
      description: 'Home uses "home". Legal pages: privacy, cookies, terms, cancellation.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'sections',
      title: 'Sections',
      type: 'array',
      of: [
        defineArrayMember({ type: 'hero' }),
        defineArrayMember({ type: 'richText' }),
        defineArrayMember({ type: 'ctaBand' }),
        defineArrayMember({ type: 'faq' }),
      ],
    }),
    defineField({ name: 'seo', title: 'SEO', type: 'seo' }),
    defineField({ name: 'internalNote', title: 'Internal note (never shown on the site)', type: 'string' }),
  ],
  preview: { select: { title: 'title', subtitle: 'kind' } },
});
