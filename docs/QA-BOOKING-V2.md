# QA report — Booking engine v2 (B10)

**Date:** 7 Nov 2026.  
**Scope:** Feature-switch matrix, BV-01…BV-14, non-functional checks (`elite-protection-booking-v2-kit/prompts/B10-qa.md`).  
**Environment:** local Windows, Node 22.23.4, package unit/DB harness. Secrets never printed.  
**Baseline (pre-B1):** `5fa74cf` (parent of `c24870a` `@tem/features`).  
**Command:** `pnpm qa:matrix` → `node scripts/feature-matrix.mjs` (profiles in `scripts/feature-profiles.mjs`).

## 1. Switch matrix

| Profile | Switches (summary) | Fast suite | Notes |
| --- | --- | --- | --- |
| `legacy` | all off, `PRICING_MODE=zones` | **pass** | Admin nav matches pre-B1 item ids (no Companies / Drivers / Pricing v2 / Flights) |
| `elite-whatsapp` | legacy + WhatsApp | **pass** | Needs `WHATSAPP_NUMBER` digits |
| `hybrid-core` | distance + hybrid + places + WhatsApp | **pass** | Stub Google + quote signing keys in matrix env |
| `distance-core` | same with `PRICING_MODE=distance` | **pass** | |
| `full` | everything on, `FLIGHT_PROVIDER=manual` | **pass** | Companies + Drivers + Demand + Flights nav present |
| `friend` | hybrid, places, return, drivers, WhatsApp; **no** corporate/flights/demand | **pass** | Friend's transfer company set (filled for B10) |

Fast suite per profile: profile contracts, BV unit coverage, `@tem/features`, `@tem/pricing`, `@tem/geo`, web switch-off vitests (corporate / flights / geo / places), admin switch-off (corporate / drivers).

| Extra | Result | Notes |
| --- | --- | --- |
| `@tem/db` full harness (after 0031) | **pass** (95) | Was failing on `min(uuid)` before the fix |
| Web email + Viva + quote-checkout vitest | **pass** | After confirmation-email blank-line fix |
| Playwright E2E per profile | **not run** | Needs live Astro + Supabase + Viva demo per profile; use `pnpm qa:matrix:e2e` when the stack is up |
| Legacy HTML vs `5fa74cf` (`/`, `/book`, Manage, 13 email previews) | **partial** | Admin nav + email template snapshots proven in unit tests. Full HTML byte-diff against the pre-B1 commit was not re-hosted in this pass |

### Friend profile (filled in)

```env
PRICING_MODE=hybrid
FEATURE_DISTANCE_PRICING=true
FEATURE_DEMAND_PRICING=false
FEATURE_PLACES=true
FEATURE_RETURN_TRIP=true
FEATURE_FLIGHT_TRACKING=false
FEATURE_CORPORATE=false
FEATURE_DRIVERS=true
FEATURE_WHATSAPP=true
WHATSAPP_NUMBER=<digits>
GOOGLE_MAPS_SERVER_KEY=<server>
QUOTE_SIGNING_SECRET=<secret>
```

## 2. Booking scenarios (`full` intent)

| ID | Scenario | Result | Proven how / notes |
| --- | --- | --- | --- |
| BV-01 | Airport → Syntagma daytime, hybrid fixed | **pass (unit)** | `scripts/bv-scenarios.test.mjs` — fixed route beats distance |
| BV-02 | Kifisia → Glyfada 02:00 night | **pass (unit)** | Night ×1.2 then round-up |
| BV-03 | Corinth out of area | **pass (unit)** | `@tem/geo` `inServiceArea`; geo-api Corinth case |
| BV-04 | Hourly 4 h / 160 km included | **pass (unit)** | `kmIncluded === 160` |
| BV-05 | Quote 21 min then Pay → 409 | **pass (existing)** | `quote-checkout.test.ts` expired → 409 |
| BV-06 | Tampered price ignored | **pass (existing)** | Signature / money-field rejection tests |
| BV-07 | Two browsers, last V-Class | **not run** | Needs dual Playwright + single vehicle seed |
| BV-08 | Return 10 % discount | **pass (unit)** | Discount on leg 2 only; DB return-trips tests exist |
| BV-09 | Cancel leg 2 only | **not run (E2E)** | Covered in design/DB; live refund not exercised here |
| BV-10 | Flight delay 40 min (manual) | **pass (unit / prior)** | Flight-tracking suite + B7 commit; admin “Set delay” E2E not re-run |
| BV-11 | Corporate on account | **pass (unit)** | On-account guards + company price; no Viva on `skipPayment` path |
| BV-12 | Company A opens B booking URL | **pass (DB RLS)** | `packages/db/tests/corporate.test.mjs` cross-company select = 0 |
| BV-13 | Zero rates → not priced | **pass (unit)** | Hidden / `not_priced` |
| BV-14 | Demand ~90 % → +20 % | **pass (unit)** | Factor 1.2; breakdown has demand; public total only |

## 3. Non-functional

| Check | Result | Notes |
| --- | --- | --- |
| axe on `/book` 1–3, Manage, `/business/app`, Admin Pricing / Simulator / Companies | **partial** | Existing booking + B5 pricing axe specs; `/business/app` + Companies axe not re-run without servers |
| `/api/quote` p95 < 1.2 s (Routes mocked 300 ms); cache hit < 150 ms | **not measured** | Needs a timed harness against a running web with mocked Routes |
| One Routes call per “View options” | **not measured** | Debounce/cache exist (`route_cache`); count not instrumented this pass |
| Client bundle secrets (`KEY` / `SECRET` / `service_role`) | **pass** | `node scripts/qa-secrets-grep.mjs` on existing `dist` — clean |
| Emails under 102 KB; previews | **pass** | `email.test.ts` byteLength assert + AC-13 snapshots |

## 4. Issues fixed in this QA pass

| Issue | Fix | Commit |
| --- | --- | --- |
| Confirmation email snapshot: extra blank line after corporate account lines | Build text parts only when present (`email-templates.ts`) | *(this commit)* |
| `record_viva_payment` → `min(uuid)` error (Viva + DB AC-06/07/11) | Migration `0031_fix_min_trip_group.sql` + same fix inlined in `0028` | *(this commit)* |
| Matrix / BV harness missing | `scripts/feature-profiles.mjs`, `feature-matrix.mjs`, tests | *(this commit)* |

Related prior commits (not QA): B9 `11c31fe`, B8 `42b21f5`, B7 `0913ce1`, B6 `10df096`, …

## 5. Known limits

- Playwright E2E and Viva **demo** end-to-end (BV-07, BV-09 live refund, full axe matrix, quote latency) need a booted web/admin + Supabase + keys; the matrix `--suite=e2e` flag is ready but was not executed in this environment.
- Legacy HTML byte-diff vs `5fa74cf` was replaced by a **nav + email contract** check; visual pages still carry V2 design from prompt 30 regardless of feature flags.
- Statement “PDF” for corporate remains CSV/HTML download (no PDF library).
- Demand step uses `occupancy > over` (strictly greater than 0.9 for the 1.2 step).

## 6. Go-live checklist

- [ ] Google Cloud quotas + budget alert on the **client** GCP project (Routes / Places).
- [ ] Flight provider key + plan (`FLIGHT_PROVIDER` / `FLIGHT_PROVIDER_KEY`) or keep `manual` only for staging.
- [ ] Rates filled in Admin → Pricing (non-zero `class_rates`; night / areas / waiting as agreed).
- [ ] `QUOTE_SIGNING_SECRET` and `CRON_SECRET` set in Vercel (web); never `PUBLIC_`.
- [ ] WhatsApp number tested on a real phone (`FEATURE_WHATSAPP=true`, `WHATSAPP_NUMBER` digits only).
- [ ] Confirm profile: Elite (`elite-whatsapp` or `hybrid-core` / `full`) vs friend (`friend`) env on the deployment.
- [ ] Run `pnpm qa:matrix` (fast) on CI; run `pnpm qa:matrix:e2e` once against staging before cutover.
- [ ] One real Viva demo payment + one refund on the target profile.
