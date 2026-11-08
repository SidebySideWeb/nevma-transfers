import { defineField, defineType } from 'sanity';

/** Singleton: copy for the expanding search widget (B4b). */
export const bookingWidget = defineType({
  name: 'bookingWidget',
  title: 'Booking widget',
  type: 'document',
  fields: [
    defineField({
      name: 'emptyMessage',
      title: 'Empty panel message',
      type: 'text',
      rows: 3,
      initialValue:
        "Set your pick-up anywhere in Athens and Attica. We'll be there on time.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'popularRoutesTitle',
      title: 'Popular routes heading',
      type: 'string',
      initialValue: 'Popular routes',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'maxPopularRoutes',
      title: 'Max popular routes',
      type: 'number',
      initialValue: 8,
      validation: (Rule) => Rule.required().integer().min(1).max(20),
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Booking widget' }),
  },
});
