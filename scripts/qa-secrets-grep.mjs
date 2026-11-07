#!/usr/bin/env node
/**
 * B10 non-func: grep built client bundles for KEY / SECRET / service_role markers.
 * Does not print matching lines (avoids leaking values). Exit 1 on hits.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots = [
  join(root, 'apps/web/dist/client'),
  join(root, 'apps/web/dist'),
  join(root, 'apps/admin/dist/client'),
  join(root, 'apps/admin/dist'),
].filter((p) => existsSync(p));

if (!roots.length) {
  console.log('qa-secrets-grep: no dist/ found — skip (run a production build first).');
  process.exit(0);
}

const PATTERNS = [
  { name: 'service_role', re: /service_role/i },
  { name: 'SECRET_ASSIGN', re: /(?:VIVA_|SUPABASE_|QUOTE_|ADMIN_|CRON_|FLIGHT_|GOOGLE_).*SECRET\s*[:=]/ },
  { name: 'KEY_ASSIGN', re: /(?:VIVA_|SUPABASE_|FLIGHT_|GOOGLE_).*KEY\s*[:=]\s*['"][^'"]{8,}/ },
];

const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'server') continue; // server output may hold env wiring; client only
      walk(full);
      continue;
    }
    if (!/\.(js|mjs|cjs|css|html|map)$/i.test(name)) continue;
    if (st.size > 8_000_000) continue;
    const text = readFileSync(full, 'utf8');
    for (const p of PATTERNS) {
      if (p.re.test(text)) offenders.push({ file: relative(root, full), pattern: p.name });
    }
  }
}

for (const r of roots) walk(r);

if (offenders.length) {
  console.error(`qa-secrets-grep: ${offenders.length} hit(s) (paths only):`);
  for (const o of offenders.slice(0, 40)) console.error(`  ${o.pattern} ← ${o.file}`);
  process.exit(1);
}
console.log(`qa-secrets-grep: clean (${roots.length} root(s) scanned).`);
