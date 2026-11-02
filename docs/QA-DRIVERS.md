# QA report — Drivers and dispatch module

**Date:** 2 Nov 2026.  
**Scope:** DR-01 … DR-12 (`docs/superpowers/specs/2026-11-01-drivers-dispatch-design.md`).  
**Environment:** local Supabase `127.0.0.1:54321` / DB `:54322`, DEMO seed, admin `http://127.0.0.1:4322`, `FEATURE_DRIVERS=true` unless noted. Secrets never printed.

## Suite summary

| Suite | Result | Command / notes |
| --- | --- | --- |
| `@tem/admin` vitest | **pass** (99) | `pnpm --filter @tem/admin test` |
| `@tem/admin` vitest with `FEATURE_DRIVERS=false` | **pass** (99) | Same; contract tests force `true` for their own suite |
| `@tem/db` (incl. drivers) | **pass** (67) | `pnpm --filter @tem/db test -- drivers.test.mjs` (full harness) |
| Playwright drivers (desktop) | **pass** (3) | `run-e2e.ps1 e2e/drivers.spec.ts e2e/today.spec.ts e2e/pay-reports.spec.ts --project=desktop --workers=1` |
| Full-day walk script | **pass** | `pnpm --filter @tem/admin exec node scripts/qa-drivers-full-day.mjs` |
| Playwright with drivers off | **not re-run on fresh server** | Unit DR-01 proves 404; dedicated `QA_DRIVERS_OFF=1` + `FEATURE_DRIVERS=false` needs no reused `astro` process |

## Acceptance matrix

| Id | Result | Proven how | Evidence |
| --- | --- | --- | --- |
| **DR-01** | **pass** | Vitest `drivers.test.ts`: default off; `driversNotFound` → 404; `handleMe` → 404 when off | `pnpm --filter @tem/admin test -- src/lib/drivers.test.ts` |
| **DR-02** | **pass** | Playwright: assign driver; overlapping booking shows clash reference; timeline “Driver assigned” | `e2e/drivers.spec.ts` |
| **DR-03** | **pass** | Playwright: Add driver + invite path; link `user_id`; driver login only `/driver-welcome` | `e2e/drivers.spec.ts` |
| **DR-04** | **pass** | DB: one open shift per driver/vehicle; Playwright: office Add shift on driver page | `packages/db/tests/drivers.test.mjs` (shifts); `e2e/drivers.spec.ts` |
| **DR-05** | **pass** | Playwright: office trip status → completed; DB: driver forward-only on shift | `e2e/today.spec.ts`; `drivers.test.mjs` trip status |
| **DR-06** | **pass** | Playwright Today board fleet/drivers rows + axe; 60s refresh in page | `e2e/today.spec.ts` |
| **DR-07** | **pass** | DB pay examples (salary pro rata, daily, hours, %, transfer overrides, adjustments) | `drivers.test.mjs` pay test |
| **DR-08** | **pass** | Playwright: build → adjust → recalculate → approve → recalc refused → mark paid | `e2e/pay-reports.spec.ts` |
| **DR-09** | **pass** | Playwright: week/month/quarter/custom; CSV BOM + Excel download | `e2e/pay-reports.spec.ts`; Vitest `export-excel.test.ts` |
| **DR-10** | **pass** | Contract Vitest: all paths + Ajv OpenAPI schemas; other driver’s job 404; no `price`/`amount` outside earnings | `src/lib/driver-api/contract.test.ts` |
| **DR-11** | **pass** | Contract: job 48h out → `customerPhone` null; DB jobs test for near window | `contract.test.ts`; `drivers.test.mjs` |
| **DR-12** | **pass** | axe at 390 / 1024 / 1440 on Drivers, driver detail, Today, statement, Reports | `e2e/drivers.spec.ts`, `today.spec.ts`, `pay-reports.spec.ts` |

## Review focus

| # | Topic | Result | Notes |
| --- | --- | --- | --- |
| 1 | Reassign after trip started → timeline + status reset | **pass (DB)** | `set_trip_status` / assignment trigger resets to scheduled; UI refreshes badge on reload (`docs/DRIVERS.md`) |
| 2 | Forgotten open shift → `already_on_shift`; office can end | **pass** | Contract + API return 409 `already_on_shift`; office shift dialog on driver page |
| 3 | DST shift hours | **pass (existing)** | Booking DST covered in `@tem/db` AC-14; shift hours use `ended_at - started_at` |
| 4 | Excel numbers/dates | **pass** | `export-excel.test.ts` opens workbook with `exceljs` |
| 5 | Expired driver token → 401 not 500 | **pass** | `contract.test.ts` invalid Bearer → 401 |

## Full-day walk (automated)

Command: `pnpm --filter @tem/admin exec node scripts/qa-drivers-full-day.mjs`  
(Admin must be up with `FEATURE_DRIVERS=true`.)

| Step | Result |
| --- | --- |
| Create two drivers | **pass** |
| Pay plan on driver 1 | **pass** |
| Assign three bookings | **pass** |
| Driver sign-in + `GET /me` | **pass** |
| `POST /shift/start` | **pass** |
| Trip status on_way → arrived → on_board → completed | **pass** |
| `POST /shift/end` | **pass** |
| Build + approve weekly statement (staff RPC) | **pass** |
| `report_driver_pay` for the week | **pass** |
| CSV/Excel HTTP exports | **pass** via DR-09 Playwright (same session) |

## Fixes during QA

- `e2e/seed-today.sql`: delete recent/open shifts on `DEMO E-CLASS-1` so the seed open shift cannot overlap leftover contract/QA shifts.
- Local staff after `supabase db reset`: recreate `office@tem.local` (`apps/admin/scripts/seed-local-staff.mjs`).
- Migration `0020` / DEMO seed already applied for Driver API rate limits (from D5).

## FEATURE_DRIVERS=false

- Vitest: **pass** with `FEATURE_DRIVERS=false` in the environment (99 tests).
- Existing non-driver behaviour unchanged for unit coverage.
- To prove nav/pages 404 in browser: stop any reused admin, then  
  `FEATURE_DRIVERS=false QA_DRIVERS_OFF=1` + Playwright `e2e/drivers-off.spec.ts` with `reuseExistingServer` false.
