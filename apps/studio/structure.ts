import type { StructureResolver } from 'sanity/structure';

// Documents that exist exactly once, with a fixed _id equal to the type name.
export const singletonTypes = new Set(['siteSettings', 'uiStrings', 'bookingWidget']);
export const singletonActions = new Set(['publish', 'discardChanges', 'restore']);
// Created by the site's server only, never from "Create new".
export const serverOnlyTypes = new Set(['formSubmission']);
// Submissions: staff may change status and notes and delete (for data requests); no duplicate.
export const submissionActions = new Set(['publish', 'discardChanges', 'delete', 'restore']);

type NewOption = { templateId: string };

export function filterNewDocumentOptions<T extends NewOption>(prev: T[], _context?: unknown): T[] {
  return prev.filter((option) => !singletonTypes.has(option.templateId) && !serverOnlyTypes.has(option.templateId));
}

const FORMS: { key: string; title: string }[] = [
  { key: 'transfer-request', title: 'Request a transfer' },
  { key: 'vip-security', title: 'VIP security enquiries' },
  { key: 'contact', title: 'Contact' },
];
const STATUSES: { key: string; title: string }[] = [
  { key: 'new', title: 'New' },
  { key: 'in-progress', title: 'In progress' },
  { key: 'done', title: 'Done' },
];

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Elite Protection')
    .items([
      S.listItem().title('Site settings').id('siteSettings').child(S.document().schemaType('siteSettings').documentId('siteSettings')),
      S.listItem().title('UI strings').id('uiStrings').child(S.document().schemaType('uiStrings').documentId('uiStrings')),
      S.listItem()
        .title('Booking widget')
        .id('bookingWidget')
        .child(S.document().schemaType('bookingWidget').documentId('bookingWidget')),
      S.divider(),
      S.documentTypeListItem('page').title('Pages'),
      S.documentTypeListItem('route').title('Routes'),
      S.documentTypeListItem('vehicleClass').title('Vehicle classes'),
      S.divider(),
      S.listItem()
        .title('Forms and submissions')
        .id('forms')
        .child(
          S.list()
            .title('Forms and submissions')
            .items([
              S.documentTypeListItem('form').title('Form settings'),
              S.divider(),
              ...FORMS.map((f) =>
                S.listItem()
                  .title(f.title)
                  .id(`submissions-${f.key}`)
                  .child(
                    S.list()
                      .title(f.title)
                      .items([
                        ...STATUSES.map((s) =>
                          S.listItem()
                            .title(s.title)
                            .id(`submissions-${f.key}-${s.key}`)
                            .child(
                              S.documentList()
                                .title(`${f.title}: ${s.title}`)
                                .schemaType('formSubmission')
                                .filter('_type == "formSubmission" && formKey == $form && status == $status')
                                .params({ form: f.key, status: s.key })
                                .defaultOrdering([{ field: 'submittedAt', direction: 'desc' }]),
                            ),
                        ),
                        S.listItem()
                          .title('All')
                          .id(`submissions-${f.key}-all`)
                          .child(
                            S.documentList()
                              .title(`${f.title}: all`)
                              .schemaType('formSubmission')
                              .filter('_type == "formSubmission" && formKey == $form')
                              .params({ form: f.key })
                              .defaultOrdering([{ field: 'submittedAt', direction: 'desc' }]),
                          ),
                      ]),
                  ),
              ),
            ]),
        ),
    ]);
