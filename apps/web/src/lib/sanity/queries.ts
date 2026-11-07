import { defineQuery } from 'groq';

const imageProjection = /* groq */ `
  alt,
  asset->{
    _id,
    url,
    metadata { dimensions { width, height } }
  }
`;

const formProjection = /* groq */ `
  key,
  title,
  intro,
  recipientEmail,
  topics[]{ key, label, recipientEmail, _key },
  submitLabel,
  successTitle,
  successMessage,
  retentionMonths
`;

const routeProjection = /* groq */ `
  title,
  "slug": slug.current,
  fromZone,
  toZone,
  intro,
  body,
  photo{ ${imageProjection} },
  faq[]{ question, answer, _key },
  featured,
  sortOrder,
  seo{
    title,
    description,
    noindex,
    image{ ${imageProjection} }
  },
  internalNote
`;

const ctaProjection = /* groq */ `label, target, url`;
const displayHeadingProjection = /* groq */ `before, accent, after`;

const sectionProjection = /* groq */ `
  ...,
  image{ ${imageProjection} },
  photo{ ${imageProjection} },
  heading{ ${displayHeadingProjection} },
  primary{ ${ctaProjection} },
  secondary{ ${ctaProjection} },
  link{ ${ctaProjection} },
  asideLink{ ${ctaProjection} },
  form->{ ${formProjection} },
  route->{ ${routeProjection} },
  cards[]{ ..., image{ ${imageProjection} }, link{ ${ctaProjection} } },
  tiles[]{ ..., image{ ${imageProjection} } },
  items[]{ ... },
  steps[]{ ... },
  notes[]{ ... },
  faqs[]{ ... },
  _type == "hero" => {
    heading,
    subheading,
    ctaLabel,
    ctaTarget,
    ctaUrl,
    image{ ${imageProjection} }
  },
  _type == "routeList" => {
    heading,
    intro,
    routes[]->{ ${routeProjection} }
  },
  _type == "formBlock" => {
    heading,
    form->{ ${formProjection} }
  },
  _type == "featuredRoute" => {
    ...,
    route->{ ${routeProjection} },
    image{ ${imageProjection} },
    heading{ ${displayHeadingProjection} },
    primary{ ${ctaProjection} },
    secondary{ ${ctaProjection} },
    noteLink{ ${ctaProjection} }
  },
  _type == "occasions" => {
    ...,
    heading{ ${displayHeadingProjection} },
    items[]{ ..., image{ ${imageProjection} } }
  },
  _type == "serviceColumns" => {
    ...,
    heading{ ${displayHeadingProjection} },
    columns[]{ ... }
  },
  _type == "escortFeature" => {
    ...,
    heading{ ${displayHeadingProjection} },
    image{ ${imageProjection} },
    primary{ ${ctaProjection} },
    secondary{ ${ctaProjection} }
  },
  _type == "clientsBlock" => {
    ...,
    heading{ ${displayHeadingProjection} },
    image{ ${imageProjection} },
    primary{ ${ctaProjection} },
    secondary{ ${ctaProjection} }
  },
  _type == "legalDocument" => {
    ...,
    heading{ ${displayHeadingProjection} },
    body
  },
  _type == "enquiryForm" => {
    ...,
    form->{ ${formProjection} },
    heading{ ${displayHeadingProjection} },
    asideLink{ ${ctaProjection} }
  }
`;

export const SITE_SETTINGS_QUERY = defineQuery(`
  *[_type == "siteSettings" && _id == "siteSettings"][0]{
    companyName,
    tagline,
    phone,
    mobilePhone,
    email,
    bookingNotificationEmail,
    address,
    openingHours,
    timezone,
    showFromPrices,
    defaultSeo{
      title,
      description,
      noindex,
      image{ ${imageProjection} }
    },
    logo{
      ${imageProjection}
    },
    whatsapp{
      enabled,
      label,
      greeting,
      showFloatingButton
    },
    internalNote
  }
`);

export const UI_STRINGS_QUERY = defineQuery(`
  *[_type == "uiStrings" && _id == "uiStrings"][0]{
    strings[]{
      area,
      key,
      value
    },
    internalNote
  }
`);

export const VEHICLE_CLASSES_QUERY = defineQuery(`
  *[_type == "vehicleClass"] | order(sortOrder asc){
    key,
    name,
    fullName,
    tagline,
    group,
    photos[]{
      ${imageProjection}
    },
    copy,
    specs[]{
      label,
      value
    },
    sortOrder,
    seo{
      title,
      description,
      noindex,
      image{ ${imageProjection} }
    },
    internalNote
  }
`);

export const VEHICLE_CLASS_BY_KEY_QUERY = defineQuery(`
  *[_type == "vehicleClass" && key == $key][0]{
    key,
    name,
    fullName,
    tagline,
    group,
    photos[]{
      ${imageProjection}
    },
    copy,
    specs[]{
      label,
      value
    },
    sortOrder,
    seo{
      title,
      description,
      noindex,
      image{ ${imageProjection} }
    },
    internalNote
  }
`);

export const PAGE_BY_SLUG_QUERY = defineQuery(`
  *[_type == "page" && slug.current == $slug][0]{
    kind,
    title,
    "slug": slug.current,
    sections[]{
      ${sectionProjection}
    },
    seo{
      title,
      description,
      noindex,
      image{ ${imageProjection} }
    },
    internalNote
  }
`);

export const PAGES_STANDARD_QUERY = defineQuery(`
  *[_type == "page" && kind == "standard"] | order(title asc){
    kind,
    title,
    "slug": slug.current,
    sections[]{
      ${sectionProjection}
    },
    seo{
      title,
      description,
      noindex,
      image{ ${imageProjection} }
    },
    internalNote
  }
`);

export const ROUTES_QUERY = defineQuery(`
  *[_type == "route"] | order(sortOrder asc){
    ${routeProjection}
  }
`);

export const ROUTE_BY_SLUG_QUERY = defineQuery(`
  *[_type == "route" && slug.current == $slug][0]{
    ${routeProjection}
  }
`);

export const FEATURED_ROUTES_QUERY = defineQuery(`
  *[_type == "route" && featured == true] | order(sortOrder asc){
    ${routeProjection}
  }
`);

export const FORMS_QUERY = defineQuery(`
  *[_type == "form"] | order(key asc){
    ${formProjection}
  }
`);

export const FORM_BY_KEY_QUERY = defineQuery(`
  *[_type == "form" && key == $key][0]{
    ${formProjection}
  }
`);
