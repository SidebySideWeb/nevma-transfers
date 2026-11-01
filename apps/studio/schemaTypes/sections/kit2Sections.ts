// Kit 2 page sections. Each is an object registered in page.sections.
import { defineArrayMember, defineField, defineType } from 'sanity';
import { altField, imageOptions } from '../lib/imageWithAlt';

const blockBody = defineArrayMember({
  type: 'block',
  styles: [{ title: 'Normal', value: 'normal' }, { title: 'Subheading', value: 'h3' }],
  lists: [{ title: 'Bullet', value: 'bullet' }, { title: 'Numbered', value: 'number' }],
  marks: {
    decorators: [{ title: 'Strong', value: 'strong' }, { title: 'Emphasis', value: 'em' }],
    annotations: [{ name: 'link', type: 'object', title: 'Link', fields: [{ name: 'href', type: 'url', title: 'URL', validation: (Rule) => Rule.uri({ scheme: ['http', 'https', 'mailto', 'tel'], allowRelative: true }) }] }],
  },
});

const cta = [
  defineField({ name: 'ctaLabel', title: 'Button label', type: 'string' }),
  defineField({
    name: 'ctaTarget',
    title: 'Button goes to',
    type: 'string',
    options: { list: [{ title: 'Booking page', value: 'book' }, { title: 'Request a quote', value: 'quote' }, { title: 'Other link', value: 'url' }], layout: 'radio' },
    initialValue: 'book',
  }),
  defineField({ name: 'ctaUrl', title: 'Other link', type: 'url', validation: (Rule) => Rule.uri({ allowRelative: true }), hidden: ({ parent }) => parent?.ctaTarget !== 'url' }),
];

export const featureGrid = defineType({
  name: 'featureGrid',
  title: 'Feature grid',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string' }),
    defineField({ name: 'intro', title: 'Intro', type: 'text', rows: 2 }),
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      of: [defineArrayMember({
        type: 'object',
        name: 'featureItem',
        fields: [
          defineField({ name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required() }),
          defineField({ name: 'text', title: 'Text', type: 'text', rows: 3, validation: (Rule) => Rule.required() }),
          defineField({ name: 'link', title: 'Link (optional)', type: 'string', description: 'A path on this site, for example /vip-security' }),
        ],
        preview: { select: { title: 'title', subtitle: 'text' } },
      })],
      validation: (Rule) => Rule.min(2).max(6),
    }),
  ],
  preview: { select: { title: 'heading' }, prepare: ({ title }) => ({ title: title ?? 'Feature grid', subtitle: 'Feature grid' }) },
});

export const imageText = defineType({
  name: 'imageText',
  title: 'Image and text',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'body', title: 'Text', type: 'array', of: [blockBody], validation: (Rule) => Rule.required() }),
    defineField({ name: 'image', title: 'Image', type: 'image', options: imageOptions, fields: [altField], validation: (Rule) => Rule.required() }),
    defineField({ name: 'imageSide', title: 'Image side', type: 'string', options: { list: ['left', 'right'], layout: 'radio' }, initialValue: 'right' }),
    ...cta,
  ],
  preview: { select: { title: 'heading', media: 'image' }, prepare: ({ title, media }) => ({ title: title ?? 'Image and text', subtitle: 'Image and text', media }) },
});

export const steps = defineType({
  name: 'steps',
  title: 'Steps',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string' }),
    defineField({
      name: 'items',
      title: 'Steps',
      type: 'array',
      of: [defineArrayMember({
        type: 'object',
        name: 'stepItem',
        fields: [
          defineField({ name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required() }),
          defineField({ name: 'text', title: 'Text', type: 'text', rows: 2 }),
        ],
        preview: { select: { title: 'title', subtitle: 'text' } },
      })],
      validation: (Rule) => Rule.min(2).max(6),
    }),
  ],
  preview: { select: { title: 'heading' }, prepare: ({ title }) => ({ title: title ?? 'Steps', subtitle: 'Steps' }) },
});

export const vehicleClassList = defineType({
  name: 'vehicleClassList',
  title: 'Vehicle list',
  type: 'object',
  description: 'Shows every published vehicle class that is active in the booking system, in sort order.',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string' }),
    defineField({ name: 'intro', title: 'Intro', type: 'text', rows: 2 }),
  ],
  preview: { select: { title: 'heading' }, prepare: ({ title }) => ({ title: title ?? 'Vehicle list', subtitle: 'Vehicle list' }) },
});

export const routeList = defineType({
  name: 'routeList',
  title: 'Route list',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string' }),
    defineField({ name: 'intro', title: 'Intro', type: 'text', rows: 2 }),
    defineField({
      name: 'routes',
      title: 'Routes',
      type: 'array',
      description: 'Leave empty to show the routes marked "Featured".',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'route' }] })],
    }),
  ],
  preview: { select: { title: 'heading' }, prepare: ({ title }) => ({ title: title ?? 'Route list', subtitle: 'Route list' }) },
});

export const contactDetails = defineType({
  name: 'contactDetails',
  title: 'Contact details',
  type: 'object',
  description: 'Phone, email, address and opening hours from Site settings.',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string' }),
    defineField({ name: 'showHours', title: 'Show opening hours', type: 'boolean', initialValue: true }),
  ],
  preview: { select: { title: 'heading' }, prepare: ({ title }) => ({ title: title ?? 'Contact details', subtitle: 'Contact details' }) },
});

export const formBlock = defineType({
  name: 'formBlock',
  title: 'Form',
  type: 'object',
  fields: [
    defineField({ name: 'form', title: 'Form', type: 'reference', to: [{ type: 'form' }], validation: (Rule) => Rule.required() }),
    defineField({ name: 'heading', title: 'Heading (optional, defaults to the form title)', type: 'string' }),
  ],
  preview: { select: { title: 'heading', form: 'form.title' }, prepare: ({ title, form }) => ({ title: title ?? form ?? 'Form', subtitle: 'Form' }) },
});

export const kit2Sections = [featureGrid, imageText, steps, vehicleClassList, routeList, contactDetails, formBlock];
