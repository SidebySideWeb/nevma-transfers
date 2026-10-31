import type { StructureResolver } from 'sanity/structure';

// Documents that exist exactly once, with a fixed _id equal to the type name.
export const singletonTypes = new Set(['siteSettings', 'uiStrings']);
export const singletonActions = new Set(['publish', 'discardChanges', 'restore']);

type NewOption = { templateId: string };

export function filterNewDocumentOptions<T extends NewOption>(prev: T[], _context?: unknown): T[] {
  return prev.filter((option) => !singletonTypes.has(option.templateId));
}

export const structure: StructureResolver = (S) =>
  S.list()
    .title('TEM Protection')
    .items([
      S.listItem().title('Site settings').id('siteSettings').child(S.document().schemaType('siteSettings').documentId('siteSettings')),
      S.listItem().title('UI strings').id('uiStrings').child(S.document().schemaType('uiStrings').documentId('uiStrings')),
      S.divider(),
      S.documentTypeListItem('page').title('Pages'),
      S.documentTypeListItem('vehicleClass').title('Vehicle classes'),
    ]);
