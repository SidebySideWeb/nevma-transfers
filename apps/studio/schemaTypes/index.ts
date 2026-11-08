import { ctaBand } from './sections/ctaBand';
import { faq } from './sections/faq';
import { hero } from './sections/hero';
import { richText } from './sections/richText';
import { kit2Sections } from './sections/kit2Sections';
import { v2SectionTypes, v2SharedTypes } from './sections/v2Sections';
import { form } from './form';
import { formSubmission } from './formSubmission';
import { page } from './page';
import { route } from './route';
import { seo } from './seo';
import { bookingWidget } from './bookingWidget';
import { siteSettings } from './siteSettings';
import { uiStrings } from './uiStrings';
import { vehicleClass } from './vehicleClass';

export const schemaTypes = [
  siteSettings, bookingWidget, uiStrings, vehicleClass, page, route, form, formSubmission,
  seo, hero, richText, ctaBand, faq, ...kit2Sections,
  ...v2SharedTypes, ...v2SectionTypes,
];
