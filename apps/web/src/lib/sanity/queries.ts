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

const sectionProjection = /* groq */ `
  _type,
  _key,
  _type == "hero" => {
    heading,
    subheading,
    ctaLabel,
    ctaTarget,
    ctaUrl,
    image{ ${imageProjection} }
  },
  _type == "richText" => {
    heading,
    body
  },
  _type == "ctaBand" => {
    heading,
    text,
    ctaLabel,
    ctaTarget,
    ctaUrl
  },
  _type == "faq" => {
    heading,
    items[]{ question, answer, _key }
  },
  _type == "featureGrid" => {
    heading,
    intro,
    items[]{ title, text, link, _key }
  },
  _type == "imageText" => {
    heading,
    body,
    image{ ${imageProjection} },
    imageSide,
    ctaLabel,
    ctaTarget,
    ctaUrl
  },
  _type == "steps" => {
    heading,
    items[]{ title, text, _key }
  },
  _type == "vehicleClassList" => {
    heading,
    intro
  },
  _type == "routeList" => {
    heading,
    intro,
    routes[]->{ ${routeProjection} }
  },
  _type == "contactDetails" => {
    heading,
    showHours
  },
  _type == "formBlock" => {
    heading,
    form->{ ${formProjection} }
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
    tagline,
    photos[]{
      ${imageProjection}
    },
    specs[]{
      label,
      value
    },
    sortOrder,
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
