#!/usr/bin/env node
// Fails (exit 1) while any DEMO placeholder is left in seeds or app source.
// Usage: node scripts/check-placeholders.mjs [--root <dir>]
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, extname } from 'node:path';

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const root = resolve(rootIdx >= 0 ? args[rootIdx + 1] : process.cwd());

const SKIP_DIRS = new Set(['node_modules', '.git', '.astro', '.vercel', '.turbo', 'dist', '.next']);
const TEXT_EXT = new Set(['.json', '.ndjson', '.sql', '.md', '.ts', '.tsx', '.js', '.mjs', '.astro', '.css', '.html', '.txt', '.yaml', '.yml']);
const MARKER = /\bDEMO\b/;

function scanRoots() {
  const roots = [join(root, 'seed'), join(root, 'packages', 'db', 'seed')];
  const apps = join(root, 'apps');
  if (existsSync(apps)) {
    for (const name of readdirSync(apps)) roots.push(join(apps, name, 'src'));
  }
  return roots.filter((p) => existsSync(p));
}

function walk(dir, hits) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, hits);
    else if (TEXT_EXT.has(extname(name)) && MARKER.test(readFileSync(full, 'utf8'))) hits.push(full);
  }
}

const hits = [];
for (const dir of scanRoots()) walk(dir, hits);

if (hits.length) {
  console.log('DEMO placeholders found. Replace them with real client content before launch:');
  for (const h of hits) console.log(' - ' + relative(root, h));
  process.exit(1);
}
console.log('No DEMO placeholders found.');
