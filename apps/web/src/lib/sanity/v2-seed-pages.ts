import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CmsPage, PageSection } from './pages';

type SeedDoc = {
  _id?: string;
  _type?: string;
  kind?: string;
  title?: string;
  slug?: { current?: string };
  sections?: PageSection[];
  seo?: CmsPage['seo'];
  fromZone?: string;
  toZone?: string;
  key?: string;
  topics?: { key?: string; label?: string; recipientEmail?: string | null; _key?: string }[];
  submitLabel?: string | null;
  recipientEmail?: string;
};

let cache: Map<string, CmsPage> | null = null;
let byId: Map<string, SeedDoc> | null = null;

function seedPath(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), 'seed/sanity/data.ndjson'),
    join(process.cwd(), '../../seed/sanity/data.ndjson'),
    join(here, '../../../../seed/sanity/data.ndjson'),
    join(here, '../../../../../seed/sanity/data.ndjson'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function loadDocs(): Map<string, SeedDoc> {
  if (byId) return byId;
  byId = new Map();
  const file = seedPath();
  if (!file) return byId;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let doc: SeedDoc;
    try {
      doc = JSON.parse(line) as SeedDoc;
    } catch {
      continue;
    }
    if (doc._id) byId.set(doc._id, doc);
  }
  return byId;
}

/** Expand route/form references so seed pages match GROQ projections. */
function resolveSection(section: PageSection): PageSection {
  const s = { ...section } as Record<string, unknown>;
  const docs = loadDocs();
  const route = s.route as { _ref?: string; fromZone?: string } | undefined;
  if (route && route._ref && !route.fromZone) {
    const r = docs.get(route._ref);
    if (r?._type === 'route') {
      s.route = {
        title: r.title,
        slug: r.slug?.current,
        fromZone: r.fromZone,
        toZone: r.toZone,
      };
    }
  }
  const form = s.form as { _ref?: string; key?: string } | undefined;
  if (form && form._ref && !form.key) {
    const f = docs.get(form._ref);
    if (f?._type === 'form') {
      s.form = {
        key: f.key,
        title: f.title,
        topics: f.topics ?? null,
        submitLabel: f.submitLabel ?? null,
        recipientEmail: f.recipientEmail,
      };
    }
  }
  return s as PageSection;
}

function load(): Map<string, CmsPage> {
  if (cache) return cache;
  cache = new Map();
  const docs = loadDocs();
  for (const doc of docs.values()) {
    if (doc._type !== 'page' || !doc.slug?.current || !doc.title || !doc.kind) continue;
    const slug = doc.slug.current;
    cache.set(slug, {
      kind: doc.kind as CmsPage['kind'],
      title: doc.title,
      slug,
      sections: (doc.sections ?? []).map(resolveSection),
      seo: doc.seo ?? null,
    });
  }
  return cache;
}

/** V2 pages from the rebuilt seed (used when the live dataset still has kit sections). */
export function getV2SeedPage(slug: string): CmsPage | null {
  return load().get(slug) ?? null;
}

const V2_SECTION = new Set([
  'pageHero',
  'promiseStrip',
  'divisionCards',
  'fleetShowcase',
  'howItWorks',
  'onBoard',
  'quoteBlock',
  'ctaPanel',
  'fleetBrowser',
  'galleryMosaic',
  'priceTable',
  'includedList',
  'bookingOptions',
  'featuredRoute',
  'occasions',
  'faqList',
  'featureTrio',
  'serviceColumns',
  'escortFeature',
  'statsBar',
  'clientsBlock',
  'contactCards',
  'enquiryForm',
  'legalDocument',
]);

/** True when the page already carries V2 section types (incl. vehicle template without pageHero). */
export function pageHasV2Sections(page: CmsPage): boolean {
  return (page.sections ?? []).some(
    (s) => s && typeof s === 'object' && '_type' in s && V2_SECTION.has(String(s._type)),
  );
}
