import { defineArrayMember, defineField, defineType } from 'sanity';
import { altField, imageOptions } from './lib/imageWithAlt';
import { validateVehicleKey } from './lib/vehicleKey';

export const vehicleClass = defineType({
  name: 'vehicleClass',
  title: 'Vehicle class',
  type: 'document',
  description: 'Photos and wording for a vehicle class. Capacity, prices and availability are managed in the admin app, not here.',
  fields: [
    defineField({
      name: 'key',
      title: 'Key',
      type: 'string',
      description: 'Must equal the vehicle class key in the admin app (for example v-class). Cannot be changed after publishing.',
      validation: (Rule) => Rule.required().custom(validateVehicleKey),
      readOnly: ({ document }) => Boolean(document?._createdAt),
    }),
    defineField({ name: 'name', title: 'Name', type: 'string', description: 'Short name shown on cards, for example V-Class.', validation: (Rule) => Rule.required() }),
    defineField({ name: 'fullName', title: 'Full name', type: 'string', description: 'For headings and SEO, for example Mercedes-Benz V-Class.' }),
    defineField({ name: 'tagline', title: 'Type', type: 'string', description: 'For example Luxury van or Executive saloon.' }),
    defineField({
      name: 'group',
      title: 'Group (fleet filter)',
      type: 'string',
      options: { list: [{ title: 'Saloons', value: 'saloon' }, { title: 'Vans', value: 'van' }, { title: 'SUVs', value: 'suv' }, { title: 'Other', value: 'other' }], layout: 'radio' },
      initialValue: 'saloon',
    }),
    defineField({ name: 'amenities', title: 'On board', type: 'array', of: [defineArrayMember({ type: 'string' })], description: 'Short items, for example Wi-Fi on board.', validation: (Rule) => Rule.max(10) }),
    defineField({
      name: 'photos',
      title: 'Photos',
      type: 'array',
      of: [defineArrayMember({ type: 'image', options: imageOptions, fields: [altField] })],
      validation: (Rule) => Rule.min(1).max(12),
    }),
    defineField({
      name: 'copy',
      title: 'Description',
      type: 'array',
      of: [defineArrayMember({ type: 'block', styles: [{ title: 'Normal', value: 'normal' }], lists: [{ title: 'Bullet', value: 'bullet' }], marks: { decorators: [{ title: 'Strong', value: 'strong' }, { title: 'Emphasis', value: 'em' }], annotations: [] } })],
    }),
    defineField({
      name: 'specs',
      title: 'Specifications',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'spec',
          fields: [
            defineField({ name: 'label', title: 'Label', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'value', title: 'Value', type: 'string', validation: (Rule) => Rule.required() }),
          ],
          preview: { select: { title: 'label', subtitle: 'value' } },
        }),
      ],
    }),
    defineField({ name: 'sortOrder', title: 'Sort order', type: 'number', initialValue: 100 }),
    defineField({ name: 'seo', title: 'SEO', type: 'seo' }),
    defineField({ name: 'internalNote', title: 'Internal note (never shown on the site)', type: 'string' }),
  ],
  orderings: [{ title: 'Sort order', name: 'sortOrder', by: [{ field: 'sortOrder', direction: 'asc' }] }],
  preview: { select: { title: 'name', subtitle: 'key', media: 'photos.0' } },
});
