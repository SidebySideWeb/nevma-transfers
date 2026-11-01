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
};

let cache: Map<string, CmsPage> | null = null;

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

function load(): Map<string, CmsPage> {
  if (cache) return cache;
  cache = new Map();
  const file = seedPath();
  if (!file) return cache;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let doc: SeedDoc;
    try {
      doc = JSON.parse(line) as SeedDoc;
    } catch {
      continue;
    }
    if (doc._type !== 'page' || !doc.slug?.current || !doc.title || !doc.kind) continue;
    const slug = doc.slug.current;
    cache.set(slug, {
      kind: doc.kind as CmsPage['kind'],
      title: doc.title,
      slug,
      sections: (doc.sections ?? []) as PageSection[],
      seo: doc.seo ?? null,
    });
  }
  return cache;
}

/** V2 pages from the rebuilt seed (used when the live dataset still has kit sections). */
export function getV2SeedPage(slug: string): CmsPage | null {
  return load().get(slug) ?? null;
}

export function pageHasV2Sections(page: CmsPage): boolean {
  return (page.sections ?? []).some((s) => s && typeof s === 'object' && '_type' in s && s._type === 'pageHero');
}
