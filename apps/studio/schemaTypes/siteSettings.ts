import { defineField, defineType } from 'sanity';
import { altField, imageOptions } from './lib/imageWithAlt';

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  fields: [
    defineField({ name: 'companyName', title: 'Company name', type: 'string', initialValue: 'Elite Protection', validation: (Rule) => Rule.required() }),
    defineField({ name: 'tagline', title: 'Tagline', type: 'string' }),
    defineField({ name: 'phone', title: 'Phone', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'mobilePhone', title: 'Mobile phone (24/7)', type: 'string', description: 'Second number shown in the footer and on Contact.' }),
    defineField({ name: 'email', title: 'Public email', type: 'string', validation: (Rule) => Rule.required().email() }),
    defineField({
      name: 'bookingNotificationEmail',
      title: 'Booking notification email',
      type: 'string',
      description: 'The office mailbox that receives every new booking and cancellation.',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({ name: 'address', title: 'Office address', type: 'text', rows: 3 }),
    defineField({ name: 'openingHours', title: 'Opening hours', type: 'text', rows: 3 }),
    defineField({ name: 'timezone', title: 'Time zone', type: 'string', initialValue: 'Europe/Athens', readOnly: true }),
    defineField({
      name: 'showFromPrices',
      title: 'Show "From" prices on fleet and route pages',
      type: 'boolean',
      description: 'Prices come from the admin app. Turn off to show "Price on request" everywhere outside the booking flow.',
      initialValue: true,
    }),
    defineField({ name: 'defaultSeo', title: 'Default SEO', type: 'seo' }),
    defineField({ name: 'logo', title: 'Logo', type: 'image', options: imageOptions, fields: [altField] }),
    defineField({
      name: 'whatsapp',
      title: 'WhatsApp',
      type: 'object',
      description:
        'Shown when FEATURE_WHATSAPP is on. The phone number itself is WHATSAPP_NUMBER in the server env (one source for site and emails).',
      fields: [
        defineField({
          name: 'enabled',
          title: 'Show WhatsApp on the site',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'label',
          title: 'Label',
          type: 'string',
          initialValue: 'WhatsApp',
        }),
        defineField({
          name: 'greeting',
          title: 'Greeting (optional)',
          type: 'text',
          rows: 2,
          description: 'Overrides the default prefilled chat text when there is no booking.',
        }),
        defineField({
          name: 'showFloatingButton',
          title: 'Show floating button on phones',
          type: 'boolean',
          initialValue: true,
        }),
      ],
      options: { collapsible: true, collapsed: false },
    }),
    defineField({ name: 'internalNote', title: 'Internal note (never shown on the site)', type: 'string' }),
  ],
  preview: { prepare: () => ({ title: 'Site settings' }) },
});
