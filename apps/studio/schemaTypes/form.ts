import { defineArrayMember, defineField, defineType } from 'sanity';
import { validateCode } from './lib/code';

// The three forms of the site. Field sets are fixed in code (docs/FORMS.md); wording, recipients and retention are edited here.
export const FORM_KEYS = ['transfer-request', 'vip-security', 'contact'] as const;

export const form = defineType({
  name: 'form',
  title: 'Form',
  type: 'document',
  fields: [
    defineField({
      name: 'key',
      title: 'Form',
      type: 'string',
      options: { list: [
        { title: 'Request a transfer', value: 'transfer-request' },
        { title: 'VIP security enquiry', value: 'vip-security' },
        { title: 'Contact', value: 'contact' },
      ] },
      readOnly: ({ document }) => Boolean(document?._createdAt),
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'intro', title: 'Intro', type: 'text', rows: 3 }),
    defineField({
      name: 'recipientEmail',
      title: 'Send submissions to',
      type: 'string',
      description: 'The office mailbox for this form. Contact topics may override it.',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'topics',
      title: 'Topics',
      type: 'array',
      hidden: ({ document }) => document?.key !== 'contact',
      of: [defineArrayMember({
        type: 'object',
        name: 'formTopic',
        fields: [
          defineField({ name: 'key', title: 'Key', type: 'string', validation: (Rule) => Rule.required().custom(validateCode) }),
          defineField({ name: 'label', title: 'Label', type: 'string', validation: (Rule) => Rule.required() }),
          defineField({ name: 'recipientEmail', title: 'Send to (optional)', type: 'string', validation: (Rule) => Rule.email() }),
        ],
        preview: { select: { title: 'label', subtitle: 'recipientEmail' } },
      })],
    }),
    defineField({ name: 'submitLabel', title: 'Button label (optional, defaults to "Send")', type: 'string' }),
    defineField({ name: 'successTitle', title: 'Thank-you title', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'successMessage', title: 'Thank-you message', type: 'text', rows: 3, validation: (Rule) => Rule.required() }),
    defineField({
      name: 'retentionMonths',
      title: 'Keep submissions for (months)',
      type: 'number',
      initialValue: 24,
      validation: (Rule) => Rule.required().integer().min(1).max(120),
    }),
    defineField({ name: 'internalNote', title: 'Internal note (never shown on the site)', type: 'string' }),
  ],
  preview: { select: { title: 'title', subtitle: 'key' } },
});
