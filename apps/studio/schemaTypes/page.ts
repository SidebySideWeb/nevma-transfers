import { defineArrayMember, defineField, defineType } from 'sanity';
import { v2SectionNames } from './sections/v2Sections';

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
          { title: 'Standard page', value: 'standard' },
          { title: 'Template (vehicle page sections)', value: 'template' },
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
      description: 'Home uses "home". Legal: privacy, cookies, terms, cancellation. Standard: fleet, services, vip-security, about, contact, request-a-transfer. Template: vehicle (sections under every vehicle page).',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'sections',
      title: 'Sections',
      type: 'array',
      of: v2SectionNames.map((type) => defineArrayMember({ type })),
      description: 'Each section is one block of the V2 design, in page order. See docs/DESIGN-V2-BLOCKS.md.',
    }),
    defineField({ name: 'seo', title: 'SEO', type: 'seo' }),
    defineField({ name: 'internalNote', title: 'Internal note (never shown on the site)', type: 'string' }),
  ],
  preview: { select: { title: 'title', subtitle: 'kind' } },
});
