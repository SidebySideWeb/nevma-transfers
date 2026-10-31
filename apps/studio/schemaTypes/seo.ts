import { defineField, defineType } from 'sanity';
import { altField, imageOptions } from './lib/imageWithAlt';

export const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Falls back to the page title. Up to 60 characters.',
      validation: (Rule) => Rule.max(70).warning('Titles over 60 characters may be cut off in search results'),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      description: 'Up to 160 characters.',
      validation: (Rule) => Rule.max(200).warning('Descriptions over 160 characters may be cut off in search results'),
    }),
    defineField({
      name: 'image',
      title: 'Sharing image',
      type: 'image',
      options: imageOptions,
      fields: [altField],
    }),
    defineField({ name: 'noindex', title: 'Hide from search engines', type: 'boolean', initialValue: false }),
  ],
});
