# Port to Elite Protection admin (from Infinity Lane, 23–26 Nov 2026)

Hand this file to the **Elite Protection** chat. Implement **only** the items below. Do **not** port Infinity Lane website/v3, corporate `/business`, SearchWidget, or brand changes.

**Source repo:** Infinity Lane (`infinity-lane`), commits on `main` from 2026-11-23 through 2026-11-26.  
**Target:** Elite Protection admin (+ shared web office-booking / DB / geo as noted).  
**Package names** in IL use `@il/*`; Elite likely uses `@ep/*` or similar — map imports, do not invent new brand strings.

---

## Skip entirely (IL web / corporate only)

| Commit | Why skip |
| --- | --- |
| `dbc4c42` Restore corporate `/business` portal | Website corporate, not admin |
| `d70b00c` … `3d8edf1` SearchWidget / `/book` journey | Website booking UI |
| `ce6be72` Corporate 30-day refresh tokens | Web `/business` sessions |

---

## Env / feature prerequisites (Elite admin + web)

Set or confirm before testing address-first booking and Pricing:

| Variable | Where | Notes |
| --- | --- | --- |
| `FEATURE_DISTANCE_PRICING=true` | web + admin | Enables Places path and Pricing v2 |
| `QUOTE_SIGNING_SECRET` | **admin** (and web) | Admin `simulateQuote` signs requests to web `/api/quote/simulate`. Missing secret hides / breaks Pricing nav |
| `SERVICE_AREA` | web (default `attica`) | Only if you port the expanded polygon (item E) |
| Google Places / Maps keys | web (+ admin places proxy if used) | Address autocomplete + details |

---

## Apply order (Elite)

1. **A** — Bookings list company column/filter (if `FEATURE_CORPORATE`)
2. **B** — Address-first new booking (admin UI + office-trip/actions + web `trip-quote` / `office-booking`)
3. **C** — Lat/lng on office INSERT (`bookings_type_fields`)
4. **D** — DB migrations (renumber to Elite’s next ids) + optional email UI/API + driver tests
5. **E** — Service-area polygon (optional; only if Elite should cover Central Greece / Peloponnese / Cyclades)

---

## A. Bookings list: company column + filter

**IL commit:** `28a64a3` (2026-11-23)  
**IL file:** `apps/admin/src/pages/bookings/index.astro`

**Behaviour**

- When corporate is enabled, show a **Company** column on the bookings table.
- Add a company filter control (filter list by `company_id` / company name).
- Hide column/filter when corporate feature is off.

**Done when:** Staff can filter the bookings list by company and see which company owns each row.

---

## B. Admin new booking: address-first with Places (+ optional saved routes)

**IL commit:** `a01d3c1` (2026-11-25)

**IL files**

| Path | Role |
| --- | --- |
| `apps/admin/src/pages/bookings/new.astro` | UI: address fields first; zones optional when distance pricing |
| `apps/admin/src/scripts/new-booking.ts` | Places pins, validate zones **or** places, pass places into simulate/create |
| `apps/admin/src/actions/index.ts` | `createOfficeBooking` / `simulateQuote` accept `pickupPlace` / `dropoffPlace` |
| `apps/admin/src/lib/office-trip.ts` | Trip resolution with places |
| `apps/admin/src/lib/internal.ts` | Internal call plumbing if touched |
| `apps/web/src/lib/server/trip-quote.ts` | Server quote for office simulate without requiring zones when places set |
| `apps/web/src/lib/server/office-booking.ts` | Create office booking with places path |

**Behaviour**

- With `FEATURE_DISTANCE_PRICING`, staff pick **addresses via Places** (same autocomplete pattern as IL admin `address-autocomplete`).
- Zones remain available as an optional / alternate path if Elite still uses them.
- Optional **saved routes** when that feature exists in Elite.
- Live class availability / price uses the same stack as Pricing simulator (`simulateQuote` → signed web `/api/quote/simulate`).

**Done when:** Office can create a transfer using two Places pins with no zones selected, and see a price before submit.

---

## C. Fix: set lat/lng (and distance) on the same INSERT

**IL commit:** `3d242cf` (2026-11-25)  
**IL file:** `apps/web/src/lib/server/office-booking.ts`

**Problem:** Distance-priced rows must satisfy `bookings_type_fields` (zones **or** `distance_km` + lat). Inserting place ids without lat on the same INSERT fails the check.

**Fix:** On office booking INSERT, include `pickup_lat` / `pickup_lng` / `dropoff_*` and `distance_km` from the place pins / quote in the **same** statement as the booking row (not a later UPDATE).

**Done when:** Address-only office bookings insert without `bookings_type_fields` / check constraint errors.

---

## D. Driver jobs for place bookings, bell noise, optional customer email

**IL commit:** `20799ba` (2026-11-26)

### D1 — Migrations (copy SQL from IL, renumber for Elite)

Source files in Infinity Lane:

| IL migration | Purpose |
| --- | --- |
| `packages/db/migrations/0048_driver_jobs_place_bookings.sql` | `driver_jobs`: **LEFT JOIN** `zones` (was INNER JOIN on `from_zone_id`) so place-only bookings appear for the assigned driver |
| `packages/db/migrations/0049_driver_bell_noise.sql` | (1) `bookings_record_changes`: record `vehicle` only when `old.vehicle_id is not null` (skip first assign). (2) `driver_me.unacknowledgedChanges`: only `confirmed` / `assigned` / `cancelled`. (3) `DELETE` existing `vehicle` changes where `before->>'vehicle_id' is null` |
| `packages/db/migrations/0050_optional_customer_email.sql` | `link_booking_customer`: if email blank after trim, return without linking (do not create a shared `''` customer) |

Also mirror into Elite’s `supabase/migrations/` with Elite’s timestamp naming.

**Apply to Elite production DB** after merging (or apply SQL then commit).

### D2 — Optional customer email (office only)

**IL files**

- `apps/admin/src/pages/bookings/new.astro` — label e-mail as optional
- `apps/admin/src/scripts/new-booking.ts` — validate format only if non-empty; require email if payment link **or** “e-mail the customer” checked
- `apps/admin/src/actions/index.ts` — `email: z.union([z.literal(''), z.email()]).default('')`
- `apps/web/src/lib/server/office-booking.ts` — same zod + `superRefine`: email required when `payment === 'link'` or `emailCustomer`

Public online booking can keep email required.

**Done when:** Offline cash office booking works with blank email; payment link / email-customer still requires email.

### D3 — Tests to port

- `packages/db/tests/driver-app.test.mjs` — place booking with null zones listed; first vehicle assign not a bell notice; vehicle swap still records a change.

---

## E. Service area polygon (optional)

**IL commit:** `1baf3e3` (2026-11-26)

**IL files:** `packages/geo/areas/attica.geojson`, `packages/geo/src/areas-data.mjs`, `packages/geo/test/geo.test.mjs`, plus test updates that treat Corinth/Cyclades as **inside** and Thessaloniki/Crete/etc. as **outside**.

**Only port if** Elite should quote Central Greece, Peloponnese, and Cyclades. Otherwise leave Elite’s tighter Attica polygon.

**Note:** Feature id / `SERVICE_AREA` name can stay `attica` (IL kept the id for env compatibility).

---

## Acceptance checklist (Elite)

- [ ] `QUOTE_SIGNING_SECRET` on admin; Pricing nav works when distance pricing on  
- [ ] New booking: Places pick-up → Places drop-off → price → create (no zones)  
- [ ] No `bookings_type_fields` failure on place inserts  
- [ ] Driver API `GET /jobs?from&to` returns place-only assigned jobs on the **pickup** day  
- [ ] Bell badge is 0 after first vehicle assign; real pickup-time / vehicle-swap changes still notify  
- [ ] Office booking without email (cash/offline) succeeds; link / email-customer still needs email  
- [ ] (Optional) Company filter on bookings list  
- [ ] (Optional) Expanded service area if product wants it  

---

## How to pull exact diffs from Infinity Lane

From the Infinity Lane repo root:

```bash
# Admin company filter
git show 28a64a3 -- apps/admin/src/pages/bookings/index.astro

# Address-first new booking
git show a01d3c1

# Lat/lng INSERT fix
git show 3d242cf -- apps/web/src/lib/server/office-booking.ts

# Migrations + optional email + driver tests
git show 20799ba

# Geo (optional)
git show 1baf3e3 -- packages/geo
```

Or read the migration files directly under `packages/db/migrations/0048_*.sql` … `0050_*.sql`.

---

## Out of scope reminders

- Do not copy Infinity Lane brand, logos, or project ids into Elite.  
- Do not point Elite scripts at Infinity Lane Supabase / Sanity / Vercel.  
- Renumber migrations to Elite’s sequence; update Elite `docs/DATA-MODEL.md` in the same change.  
- Keep money in integer cents; never accept price from the browser.
