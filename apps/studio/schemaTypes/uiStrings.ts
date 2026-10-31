import { defineArrayMember, defineField, defineType } from 'sanity';
import { uiStringDefaults } from './lib/uiStringDefaults';

const knownKeys = new Set(uiStringDefaults.map((d) => d.key));

export const uiStrings = defineType({
  name: 'uiStrings',
  title: 'UI strings',
  type: 'document',
  description: 'Button labels, form labels, messages and email wording. Anything left empty uses the built-in default.',
  fields: [
    defineField({
      name: 'strings',
      title: 'Strings',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'uiString',
          fields: [
            defineField({
              name: 'area',
              title: 'Area',
              type: 'string',
              options: { list: ['booking', 'errors', 'emails'], layout: 'radio' },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'key',
              title: 'Key',
              type: 'string',
              description: 'Do not rename: the site looks strings up by this key.',
              validation: (Rule) =>
                Rule.required().custom((value) => (typeof value === 'string' && knownKeys.has(value) ? true : 'Unknown key. Keys are listed in docs/CONTENT-MODEL.md')),
            }),
            defineField({ name: 'value', title: 'Text', type: 'text', rows: 2, validation: (Rule) => Rule.required() }),
          ],
          preview: { select: { title: 'key', subtitle: 'value' } },
        }),
      ],
      validation: (Rule) =>
        Rule.custom((items) => {
          const keys = ((items as { key?: string }[] | undefined) ?? []).map((i) => i.key);
          return new Set(keys).size === keys.length ? true : 'Each key can appear only once';
        }),
    }),
    defineField({ name: 'internalNote', title: 'Internal note (never shown on the site)', type: 'string' }),
  ],
  preview: { prepare: () => ({ title: 'UI strings' }) },
});
