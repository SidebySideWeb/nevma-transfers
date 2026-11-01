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
          { title: 'Standard page', value: 'standard' },
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
      description: 'Home uses "home". Legal: privacy, cookies, terms, cancellation. Standard: fleet, services, vip-security, about, contact, request-a-transfer.',
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
        defineArrayMember({ type: 'featureGrid' }),
        defineArrayMember({ type: 'imageText' }),
        defineArrayMember({ type: 'steps' }),
        defineArrayMember({ type: 'vehicleClassList' }),
        defineArrayMember({ type: 'routeList' }),
        defineArrayMember({ type: 'contactDetails' }),
        defineArrayMember({ type: 'formBlock' }),
      ],
    }),
    defineField({ name: 'seo', title: 'SEO', type: 'seo' }),
    defineField({ name: 'internalNote', title: 'Internal note (never shown on the site)', type: 'string' }),
  ],
  preview: { select: { title: 'title', subtitle: 'kind' } },
});
