import { defineQuery } from 'groq';

const imageProjection = /* groq */ `
  alt,
  asset->{
    _id,
    url,
    metadata { dimensions { width, height } }
  }
`;

export const SITE_SETTINGS_QUERY = defineQuery(`
  *[_type == "siteSettings" && _id == "siteSettings"][0]{
    companyName,
    tagline,
    phone,
    email,
    bookingNotificationEmail,
    address,
    openingHours,
    timezone,
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
      }
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
