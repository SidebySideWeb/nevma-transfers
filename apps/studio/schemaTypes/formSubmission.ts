import { defineArrayMember, defineField, defineType } from 'sanity';

// Written by the site's server (Editor robot token) for every form submission. Staff change the status and notes only.
export const SUBMISSION_STATUSES = ['new', 'in-progress', 'done'] as const;

export const formSubmission = defineType({
  name: 'formSubmission',
  title: 'Form submission',
  type: 'document',
  fields: [
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: { list: [{ title: 'New', value: 'new' }, { title: 'In progress', value: 'in-progress' }, { title: 'Done', value: 'done' }], layout: 'radio' },
      initialValue: 'new',
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: 'internalNote', title: 'Office notes', type: 'text', rows: 3 }),
    defineField({ name: 'form', title: 'Form', type: 'reference', to: [{ type: 'form' }], readOnly: true }),
    defineField({ name: 'formKey', title: 'Form key', type: 'string', readOnly: true }),
    defineField({ name: 'topic', title: 'Topic', type: 'string', readOnly: true }),
    defineField({ name: 'submittedAt', title: 'Submitted at', type: 'datetime', readOnly: true }),
    defineField({ name: 'name', title: 'Name', type: 'string', readOnly: true }),
    defineField({ name: 'email', title: 'Email', type: 'string', readOnly: true }),
    defineField({ name: 'phone', title: 'Phone', type: 'string', readOnly: true }),
    defineField({
      name: 'answers',
      title: 'Answers',
      type: 'array',
      readOnly: true,
      of: [defineArrayMember({
        type: 'object',
        name: 'answer',
        fields: [
          defineField({ name: 'key', title: 'Field', type: 'string' }),
          defineField({ name: 'label', title: 'Label', type: 'string' }),
          defineField({ name: 'value', title: 'Value', type: 'text', rows: 2 }),
        ],
        preview: { select: { title: 'label', subtitle: 'value' } },
      })],
    }),
    defineField({ name: 'consent', title: 'Consent given', type: 'boolean', readOnly: true }),
    defineField({
      name: 'emailStatus',
      title: 'Office email',
      type: 'string',
      readOnly: true,
      options: { list: ['sent', 'failed'] },
    }),
  ],
  orderings: [{ title: 'Newest first', name: 'submittedAtDesc', by: [{ field: 'submittedAt', direction: 'desc' }] }],
  preview: {
    select: { name: 'name', formKey: 'formKey', status: 'status', at: 'submittedAt', topic: 'topic' },
    prepare: ({ name, formKey, status, at, topic }) => ({
      title: `${name ?? 'Unknown'} — ${formKey ?? ''}${topic ? ` (${topic})` : ''}`,
      subtitle: `${status ?? 'new'} · ${at ? new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/Athens' }) : ''}`,
    }),
  },
});
