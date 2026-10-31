import { readFileSync } from 'node:fs';
import { createClient } from '@sanity/client';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  process.env[m[1]] = v;
}

console.log(
  'configured',
  Boolean(process.env.SANITY_PROJECT_ID),
  Boolean(process.env.SANITY_DATASET),
  Boolean(process.env.SANITY_READ_TOKEN),
);

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  apiVersion: '2026-10-01',
  useCdn: false,
  token: process.env.SANITY_READ_TOKEN || undefined,
});

const pages = await client.fetch('*[_type=="page"]{ "slug": slug.current, title }');
console.log(JSON.stringify(pages, null, 2));
