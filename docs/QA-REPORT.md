# QA report — kit 1 + kit 2

**Kit 1 date:** 31 Oct 2026. **Kit 2 date:** 1 Nov 2026.  
Environment: local (Supabase `127.0.0.1:54321` / DB `:54322`), DEMO content, Viva **demo**. Secrets never printed.

## Automated suite summary (1 Nov 2026)

| Suite | Result | Notes |
| --- | --- | --- |
| `pnpm lint` | **pass** | web + admin |
| `pnpm typecheck` | **pass** | Fixed kit 2 Astro/Zod/Form topics typing |
| `@tem/web` vitest | **pass** | 103 (after uiStrings sync + FORM_E2E_MOCK guard) |
| `@tem/admin` vitest | **pass** | 37 |
| `@tem/studio` vitest | **pass** | 22 (seed uiStrings → 240 keys) |
| `@tem/db` | **pass** | 36 |
| Root scripts (`kit-consistency`, launch guard tests) | **pass** | 16 |
| Web Playwright kit 2 (390 + 1440): fleet, routes, standard, forms, site-pages | **pass** | 38 after home hero assertion update |
| Admin Playwright AC-31 | **pass** | deploy-hook mock |
| SEO dist crawl (`pnpm --filter @tem/web check:seo`) | **pass** | |
| Launch guard dry-run (AC-21) | **fail as designed** on DEMO | lists routes, forms, `@example.com` |
| Lighthouse mobile (3 runs) | **partial** | see table; VIP LCP fail on local SSR |
| AC-29 bundle grep | **pass** (values present) | read + service role absent from client |
| AC-29 Viewer write → 403 | **fail** | `SANITY_READ_TOKEN` created a probe (HTTP 200); not Viewer-only. Probe deleted. |

Fixes landed during kit 2 QA: web typecheck; seed/live uiStrings (240); `rate_limits` in DATA-MODEL; `0010_vat.sql` present; kit-consistency `builtLater` for prompt 29 paths; home e2e hero copy; image `quality(70)` + smaller default src; hero preload + cache-control on standard pages; FORM_E2E_MOCK ignored under Vitest; AC-29 secrets script.

## Performance

### Kit 1 (AC-20) — reaffirmed 31 Oct / not re-LH this cut

| Page | Median perf | Median LCP | Median CLS |
| --- | --- | --- | --- |
| Home `/` | 100 | 763 ms | 0 |
| Legal `/privacy/` | 100 | 758 ms | 0 |

### Kit 2 (1 Nov 2026)

| Page | Median perf | Median LCP | Median CLS | Result | Proven how |
| --- | --- | --- | --- | --- | --- |
| `/fleet` | 100 | **756–1110 ms** | **0–0.002** | **pass** | Static build (`serve` / hub); 3 runs |
| `/routes/athens-airport-to-city-centre` | 99 | **2070 ms** | **0** | **pass** | Static build, 3 runs (2089 / 2070 / 2066) |
| `/contact` | 100 | **1137 ms** | **0.001** | **pass** | Astro hub mobile LH, 3 runs |
| `/vip-security` | ~75–80 | **~5.5–12 s** | **0.002** | **fail** | Astro hub SSR; LCP over 2.5 s. Re-check on Vercel preview/production CDN. CLS ok. |

## Acceptance matrix

### Kit 1 rows re-run for kit 2 touchpoints

| Id | Result | Proven how | Date | Notes |
| --- | --- | --- | --- | --- |
| AC-01 | **pass** | Existing pricing + booking-api vitest (suite green) | 1 Nov 2026 | |
| AC-16 | **pass** | catalog / booking no_price coverage still in suite | 1 Nov 2026 | |
| AC-19 | **pass** | Playwright + axe on kit 2 routes (fleet/routes/standard/forms) | 1 Nov 2026 | |
| AC-20 | **partial** | Home/legal prior; kit 2 table above — VIP LCP fail locally | 1 Nov 2026 | |
| AC-21 | **fail (expected)** | `pnpm check:live:dry` — DEMO Sanity + Postgres + example.com recipients | 1 Nov 2026 | O14–O17 still DEMO |
| AC-24 | **pass** | Client build grep (service role); kit 2 extends to Sanity tokens where set | 1 Nov 2026 | Write token / deploy hook URL not in local env for grep |

### Kit 2 (AC-25 … AC-34)

| Id | Result | Proven how | Date | Notes |
| --- | --- | --- | --- | --- |
| AC-25 | **pass** | Vitest `catalog.test.ts`; Playwright fleet From prices vs DEMO seed | 1 Nov 2026 | |
| AC-26 | **pass** | Playwright routes + forms (JS on/off prefill) | 1 Nov 2026 | |
| AC-27 | **pass (automated)** | Vitest forms-api (mocked Sanity/Resend); Playwright JS on + off → thank-you | 1 Nov 2026 | **Real inbox + Studio Status New not run** — no preview deploy / O16 still `@example.com` |
| AC-28 | **pass** | Vitest forms-api honeypot / Turnstile / 6th→429 | 1 Nov 2026 | |
| AC-29 | **fail** | Bundle: no read token / service role in client. **Read token can write (HTTP 200)** — replace with Viewer robot. Write token + deploy hook URL not present in local env for full grep. | 1 Nov 2026 | |
| AC-30 | **pass** | Vitest retention fixtures + CRON_SECRET 401 | 1 Nov 2026 | |
| AC-31 | **pass** | Admin Vitest cookies; Playwright zone save → banner → hook once → cooldown | 1 Nov 2026 | Live “From” price after Vercel rebuild **not** confirmed (no `TEM_WEB_DEPLOY_HOOK_URL` / preview) |
| AC-32 | **pass** | DB seed test; admin banner Vitest (unknown zone fixture); routes publishable filter | 1 Nov 2026 | |
| AC-33 | **partial** | Playwright axe + SEO on kit 2 pages; `check-seo-dist` unique title/description/canonical + sitemap | 1 Nov 2026 | VIP LCP fails AC-20 budget; axe/SEO pass |
| AC-34 | **pass** | ESLint rule on sections/Header/Footer; lint green | 1 Nov 2026 | |

## Manual / cloud (kit 2)

| Scenario | Status | Evidence |
| --- | --- | --- |
| Real form ×3 on preview; Studio New; office email; mark Done | **not run** | Needs preview URL, real recipients (O16), Resend |
| O14–O17 real content; launch guard green | **blocked** | Client material due Fri 20 Nov / Fri 4 Dec (`docs/DECISIONS.md`) |
| AC-31 live price → Update website → new From on route | **not run** | Needs admin + deploy hook + rebuild |
| Sanity webhook filter (no `formSubmission`) | **not verified in manage** | Documented in `docs/ARCHITECTURE.md`; cloud change pending approval |
| Vercel env (`SANITY_WRITE_TOKEN`, `PUBLIC_STUDIO_URL`, `TEM_WEB_DEPLOY_HOOK_URL`) | **not set this cut** | Ask before changing cloud |

## Security notes (1 Nov)

- Client bundles: no `SANITY_READ_TOKEN` / `SUPABASE_SERVICE_ROLE_KEY` values found (`scripts/check-secrets-kit2.mjs --skip-build`).
- **Action required:** create a Sanity **Viewer** robot for `SANITY_READ_TOKEN`; current token must not mutate. Keep Editor `SANITY_WRITE_TOKEN` server-only on `tem-web`.
- Do not put write token or deploy hook URL in any `PUBLIC_` var.

## Check (prompt 24)

| Item | Result |
| --- | --- |
| `docs/QA-REPORT.md` lists AC-25…AC-34 | **pass** |
| All pass or client-accepted in writing | **fail** — AC-21/O14–O17 DEMO; AC-29 Viewer; AC-20/33 VIP LCP; real forms + AC-31 live rebuild pending |
| Kit 1 re-runs AC-01, 16, 19, 24 | **pass**; AC-20 partial; AC-21 expected fail |

## Follow-ups

1. Replace `SANITY_READ_TOKEN` with Viewer-only; re-run AC-29 write→403.
2. Wire Vercel preview + deploy hook; re-LH `/vip-security`; AC-31 From-price after rebuild.
3. Real form run with client inboxes; record Studio ids (no PII in this file beyond status).
4. O14–O17 content; `pnpm check:live` green before production.
