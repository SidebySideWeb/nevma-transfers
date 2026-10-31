import { defineArrayMember, defineField, defineType } from 'sanity';

export const richText = defineType({
  name: 'richText',
  title: 'Text',
  type: 'object',
  fields: [
    defineField({ name: 'heading', title: 'Heading', type: 'string' }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'block',
          styles: [{ title: 'Normal', value: 'normal' }, { title: 'Heading', value: 'h2' }, { title: 'Subheading', value: 'h3' }],
          lists: [{ title: 'Bullet', value: 'bullet' }, { title: 'Numbered', value: 'number' }],
          marks: {
            decorators: [{ title: 'Strong', value: 'strong' }, { title: 'Emphasis', value: 'em' }],
            annotations: [
              { name: 'link', type: 'object', title: 'Link', fields: [{ name: 'href', type: 'url', title: 'URL', validation: (Rule) => Rule.uri({ scheme: ['http', 'https', 'mailto', 'tel'] }) }] },
            ],
          },
        }),
      ],
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: { select: { title: 'heading' }, prepare: ({ title }) => ({ title: title ?? 'Text', subtitle: 'Text' }) },
});
