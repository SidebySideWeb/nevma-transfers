# QA report — kit 1 (prompt 14)

Date: **31 Oct 2026**. Environment: local (Supabase `127.0.0.1:54321` / DB `:54322`), DEMO content, Viva **demo** (live account not yet available — due Fri 15 Jan 2027). Secrets never printed.

## Automated suite summary

| Suite | Result | Count |
| --- | --- | --- |
| `pnpm lint` | **pass** | web + admin |
| `pnpm typecheck` | **pass** | 0 errors (hints only) |
| `@tem/web` vitest | **pass** | 63 |
| `@tem/admin` vitest | **pass** | 14 |
| `@tem/studio` vitest | **pass** | 14 (seed uiStrings synced) |
| `@tem/db` + root scripts | **pass** | db suites + 14 kit/scripts tests |
| Web Playwright (390 + 1440) | **pass** | 30 |
| Admin Playwright (+ AC-24 build) | **pass** | 12 (secrets-build once on desktop) |
| Security API spot-check | **pass** | 4/4 |
| Anon PostgREST (AC-10) | **pass** | 9 tables, no rows |
| Launch guard dry-run (AC-21) | **fail as designed** on DEMO | 7 issues listed |
| Lighthouse mobile (3 runs) | **pass** | medians below |

Fixes landed during QA: Sanity seed uiString key sync; `` `rate_limits` `` in DATA-MODEL; Playwright workers/orderCode/Turnstile mocks for return pages; admin secrets-build serialised.

## Performance (AC-20)

| Page | Median perf | Median LCP | Median CLS | Median TBT |
| --- | --- | --- | --- | --- |
| Home `/` | **100** | **763 ms** | **0** | **0 ms** |
| Legal `/privacy/` | **100** | **758 ms** | **0** | **0 ms** |

`/book` client JS (gzip, unique chunks): React client **~64.3 KB** + `BookingApp` **~6.7 KB** + react helper **~2.9 KB** ≈ **74 KB** total (&lt; 100 KB proposed budget).

## Acceptance matrix

| Id | Result | Proven how | Date | Notes |
| --- | --- | --- | --- | --- |
| AC-01 | **pass** | `pricing.test.ts`; `booking-api.test.ts` amount→400; Playwright transfer hand-off; `qa-security-api.mjs` | 31 Oct 2026 | |
| AC-02 | **pass** | `packages/db/tests/schema.test.mjs` exclusion | 31 Oct 2026 | |
| AC-03 | **pass** | DB + `pricing.test.ts` hours limits | 31 Oct 2026 | |
| AC-04 | **pass** | DB expire_holds + `booking-api.test.ts` | 31 Oct 2026 | |
| AC-05 | **pass** | DB race + API 2-hold/429 | 31 Oct 2026 | |
| AC-06 | **pass** | `viva-payments.test.ts`; Playwright confirmed waits for webhook | 31 Oct 2026 | Demo Viva only |
| AC-07 | **pass** | DB unique + webhook replay test | 31 Oct 2026 | |
| AC-08 | **pass** | DB trigger + refund API tests | 31 Oct 2026 | |
| AC-09 | **pass** | DB trigger + API + email + admin Playwright VIP | 31 Oct 2026 | |
| AC-10 | **pass** | `rls.test.mjs`; `qa-anon-rls.mjs`; admin forged price rejected | 31 Oct 2026 | |
| AC-11 | **pass** | `viva-payments.test.ts` late free/taken | 31 Oct 2026 | |
| AC-12 | **pass** | API + Playwright cancel token once / tooLate | 31 Oct 2026 | |
| AC-13 | **pass** | `email.test.ts` templates + reminder claim | 31 Oct 2026 | Resend mocked |
| AC-14 | **pass** | `time.test.ts` / `range.test.ts` + DB DST | 31 Oct 2026 | UI clock-change: unit-level; full UI day pick deferred to live data |
| AC-15 | **pass** | `time.test.ts` + API lead_time | 31 Oct 2026 | |
| AC-16 | **pass** | API + Playwright no-price contact | 31 Oct 2026 | |
| AC-17 | **pass** | `booking-api.test.ts` price freeze | 31 Oct 2026 | |
| AC-18 | **pass** | Admin Playwright staff/non-staff/assign/invoice/refund | 31 Oct 2026 | |
| AC-19 | **pass** | Playwright + axe on home, legal, book steps, return, admin | 31 Oct 2026 | Zero serious/critical |
| AC-20 | **pass** | Lighthouse 3-run medians (table above); book island ~74 KB gzip | 31 Oct 2026 | Local static / preview host |
| AC-21 | **fail (expected)** | `pnpm check:live:dry` lists DEMO seed, Sanity unset, DEMO DB rows, `settings.is_demo` | 31 Oct 2026 | Guard works; **production pass blocked until real content** (O1–O8). Not client-accepted yet. |
| AC-22 | **deferred** | Live Viva account due Fri 15 Jan 2027 | 31 Oct 2026 | Needs client present: one live pay + one live refund; record refs/amounts (no card data). |
| AC-23 | **pass** | `booking-api.test.ts` Turnstile/rate limit; security API holds without token | 31 Oct 2026 | |
| AC-24 | **pass** | Admin secrets-build e2e; web `dist/client` grep; unsigned internal → 401 | 31 Oct 2026 | Values from env, never printed |

## Manual walkthrough

| Scenario | Status | Evidence |
| --- | --- | --- |
| Transfer + VIP + invoice | **pass (automated)** | Playwright AC-01 / admin VIP; invoice fields in booking island |
| Hourly 4 h | **pass (automated)** | Playwright `hourly booking for 4 hours` |
| No-price pair | **pass (automated)** | AC-16 Playwright |
| Hold expiry | **pass (automated)** | AC-04 API |
| Payment failure then retry (Viva demo) | **pass (automated)** | Return `not-completed` Playwright + AC-06 |
| Cancel from email link | **pass (automated)** | AC-12 Playwright |
| Office assign / invoice number / partial VIP refund | **pass (automated)** | Admin AC-18 Playwright |
| Real phone + desktop session | **partial** | Viewport 390/1440 Playwright; physical devices not separately recorded this run |
| Clock-change UI (2026-10-25 03:30 / 2027-03-28 03:30) | **pass (unit)** | AC-14 Vitest; UI date picker not re-driven this run |
| Vercel log search for customer PII | **not run** | No production Vercel project wired yet (prompt 13 cloud pending) |

## Security notes

- Client bundles: no service role / Viva secret / signing secret values found (AC-24).
- Anon key: empty result sets on all checked tables (AC-10).
- Amount in body → 400; missing Turnstile → 400; unsigned internal → 401.

## Check (prompt 14)

| Item | Result |
| --- | --- |
| `docs/QA-REPORT.md` lists AC-01…AC-24 | **pass** |
| All pass or client-accepted in writing | **fail** — AC-21 awaiting real data; AC-22 awaiting live Viva + client session |
| No open serious/critical a11y | **pass** |
| Performance numbers recorded | **pass** |

## Follow-ups

1. Client answers O1–O12 (`docs/DECISIONS.md`); replace DEMO; re-run `pnpm check:live` on production.
2. Wire Vercel/Supabase/Viva cloud (prompt 13 approvals); re-check Vercel logs for PII.
3. AC-22 live payment + refund with client; append references and amounts to this file.
