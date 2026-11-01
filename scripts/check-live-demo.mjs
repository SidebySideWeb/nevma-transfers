#!/usr/bin/env node
/**
 * AC-21 launch guard. Fails a production build while DEMO content remains.
 * Usage: node scripts/check-live-demo.mjs [--dry-run]
 * Never prints secret values.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const problems = [];
const require = createRequire(import.meta.url);

function section(title) {
  console.log(`\n== ${title} ==`);
}

function fail(msg) {
  problems.push(msg);
  console.log(`FAIL: ${msg}`);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function loadOptional(pkg) {
  try {
    return require(pkg);
  } catch {
    try {
      return createRequire(resolve(root, 'apps/web/package.json'))(pkg);
    } catch {
      return null;
    }
  }
}

// --- 1. Source / seed placeholders ---
section('placeholders (pnpm check:placeholders)');
{
  const res = spawnSync(process.execPath, [resolve(root, 'scripts/check-placeholders.mjs'), '--root', root], {
    encoding: 'utf8',
    cwd: root,
  });
  if (res.status !== 0) {
    fail('DEMO placeholders remain in seed or app source');
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
  } else {
    ok('no DEMO markers in seed / apps/*/src');
  }
}

// --- 2. Sanity internalNote + kit 2 route/form DEMO + example.com recipients ---
section('Sanity internalNote / routes / forms');
{
  const projectId = process.env.SANITY_PROJECT_ID || '';
  const dataset = process.env.SANITY_DATASET || '';
  const token = process.env.SANITY_READ_TOKEN || '';
  if (!projectId || !dataset || !token) {
    fail(
      'Sanity is not configured (SANITY_PROJECT_ID / SANITY_DATASET / SANITY_READ_TOKEN). Cannot prove content is free of DEMO notes.',
    );
  } else {
    const api = (query) => {
      const url = new URL(
        `https://${projectId}.api.sanity.io/v2026-10-01/data/query/${encodeURIComponent(dataset)}`,
      );
      url.searchParams.set('query', query);
      return fetch(url, { headers: { authorization: `Bearer ${token}` } });
    };
    try {
      const res = await api('count(*[defined(internalNote) && internalNote match "DEMO*"])');
      if (!res.ok) {
        fail(`Sanity query HTTP ${res.status}`);
      } else {
        const body = await res.json();
        const count = Number(body.result ?? 0);
        if (count > 0) {
          const listRes = await api(
            '*[defined(internalNote) && internalNote match "DEMO*"][0...20]{_id,_type}',
          );
          const listBody = listRes.ok ? await listRes.json() : { result: [] };
          const ids = (listBody.result || [])
            .map((d) => `${d._type}:${d._id}`)
            .join(', ');
          fail(`${count} published Sanity document(s) still have internalNote matching DEMO* (${ids})`);
        } else {
          ok('no published Sanity documents with DEMO internalNote');
        }
      }

      const routeRes = await api(
        '*[_type == "route" && defined(internalNote) && internalNote match "DEMO*"]{"slug": slug.current, title}',
      );
      if (routeRes.ok) {
        const routes = (await routeRes.json()).result || [];
        if (routes.length) {
          fail(
            `published route(s) still DEMO in internalNote: ${routes
              .map((r) => r.slug || r.title)
              .join(', ')}`,
          );
        } else {
          ok('no published routes with DEMO internalNote');
        }
      }

      const formRes = await api(
        `*[_type == "form"]{
          key,
          internalNote,
          recipientEmail,
          "topicRecipients": topics[].recipientEmail
        }`,
      );
      if (formRes.ok) {
        const forms = (await formRes.json()).result || [];
        const demoForms = forms.filter(
          (f) => typeof f.internalNote === 'string' && /DEMO/i.test(f.internalNote),
        );
        if (demoForms.length) {
          fail(`published form(s) still DEMO in internalNote: ${demoForms.map((f) => f.key).join(', ')}`);
        } else {
          ok('no published forms with DEMO internalNote');
        }
        const exampleRecipients = [];
        for (const f of forms) {
          if (typeof f.recipientEmail === 'string' && f.recipientEmail.endsWith('@example.com')) {
            exampleRecipients.push(`${f.key}:${f.recipientEmail}`);
          }
          for (const addr of f.topicRecipients || []) {
            if (typeof addr === 'string' && addr.endsWith('@example.com')) {
              exampleRecipients.push(`${f.key} topic:${addr}`);
            }
          }
        }
        if (exampleRecipients.length) {
          fail(`form recipient(s) still @example.com (${exampleRecipients.join('; ')})`);
        } else {
          ok('no form recipients end with @example.com');
        }
      }

      const settingsRes = await api('*[_type == "siteSettings"][0]{email}');
      if (settingsRes.ok) {
        const settings = (await settingsRes.json()).result;
        const email = settings?.email || '';
        if (typeof email === 'string' && email.endsWith('@example.com')) {
          fail(`siteSettings.email still ends with @example.com`);
        } else {
          ok('siteSettings.email is not @example.com');
        }
      }
    } catch (e) {
      fail(`Sanity check failed: ${e instanceof Error ? e.message : 'error'}`);
    }
  }
}

// --- 3. Postgres DEMO rows / settings.is_demo ---
section('Postgres DEMO rows and settings.is_demo');
{
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) {
    fail('DATABASE_URL is not set. Cannot prove operations data is free of DEMO labels.');
  } else {
    const pg = loadOptional('pg');
    if (!pg) {
      fail('pg package is not available to run the Postgres DEMO check');
    } else {
      const Client = pg.default?.Client || pg.Client;
      const client = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 15_000,
      });
      try {
        await client.connect();
        const { rows: demoRows } = await client.query(
          `select table_name, n from public.demo_rows where n > 0 order by table_name`,
        );
        const demoSum = demoRows.reduce((s, r) => s + Number(r.n), 0);
        if (demoSum > 0) {
          fail(
            `demo_rows still has ${demoSum} active DEMO row(s): ${demoRows
              .map((r) => `${r.table_name}=${r.n}`)
              .join(', ')}`,
          );
        } else {
          ok('demo_rows is empty (no active DEMO rows)');
        }
        const checks = [
          {
            label: 'zones.name',
            sql: `select code, name from public.zones where name like 'DEMO%' order by code`,
          },
          {
            label: 'vehicle_classes.name',
            sql: `select key, name from public.vehicle_classes where name like 'DEMO%' order by key`,
          },
          {
            label: 'extras.name',
            sql: `select code, name from public.extras where name like 'DEMO%' order by code`,
          },
          {
            label: 'vehicles.label',
            sql: `select label from public.vehicles where label like 'DEMO%' order by label`,
          },
        ];
        for (const c of checks) {
          const { rows } = await client.query(c.sql);
          if (rows.length) {
            fail(
              `${c.label}: ${rows.length} row(s) still start with DEMO (${rows
                .slice(0, 8)
                .map((r) => Object.values(r).join('='))
                .join('; ')}${rows.length > 8 ? '; …' : ''})`,
            );
          } else {
            ok(`${c.label}: none start with DEMO`);
          }
        }
      } catch (e) {
        fail(`Postgres check failed: ${e instanceof Error ? e.message : 'error'}`);
      } finally {
        try {
          await client.end();
        } catch {
          /* ignore */
        }
      }
    }
  }
}

section('result');
if (problems.length) {
  console.log(`Launch guard failed with ${problems.length} issue(s).`);
  if (dryRun) console.log('(dry-run: would block production build)');
  process.exit(1);
}
console.log(dryRun ? 'Launch guard dry-run passed.' : 'Launch guard passed.');
process.exit(0);
