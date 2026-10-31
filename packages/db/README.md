# @tem/db — Postgres schema, DEMO seed and tests

The source of truth for the TEM Protection booking database (Supabase Postgres 16). Documentation: `docs/DATA-MODEL.md`.

| Path | What |
| --- | --- |
| `migrations/0001_extensions_enums.sql` | `btree_gist`, enum types |
| `migrations/0002_core_tables.sql` | vehicle classes, vehicles, zones, routes, zone prices, hourly rates, extras, blocked slots |
| `migrations/0003_bookings_payments.sql` | bookings (exclusion constraint, type rules), booking extras (VIP flag trigger), payments (refund limit trigger), `blocked_range_for`, references |
| `migrations/0004_holds_settings_staff.sql` | settings, staff, slot holds, `class_availability`, `create_hold`, `expire_holds` |
| `migrations/0005_rls.sql` | RLS, staff policies, column grants, staff status guard |
| `migrations/0006_cron.sql` | Supabase only: `pg_cron` job, `staff` → `auth.users` FK |
| `seed/demo.sql` | DEMO data for development and staging only |
| `tests/` | Node test runner suites against a real PostgreSQL 16 |

## Source of truth vs `supabase/migrations/`

**`packages/db/migrations/` is the source.** Do not edit SQL in `supabase/migrations/` by hand.

To sync for the Supabase CLI (`supabase db push`):

1. Copy each `packages/db/migrations/000N_*.sql` into `supabase/migrations/` with a timestamp prefix that keeps numeric order, for example:
   - `20261031000100_0001_extensions_enums.sql`
   - `20261031000200_0002_core_tables.sql`
   - … through `0006`
2. Keep the file body identical — only the filename prefix changes.
3. Enable `pg_cron` in the dashboard (Database → Extensions) before applying `0006`.
4. Run `supabase db push` (or apply with `psql` against the project).

When you add `0007_….sql` under `packages/db/migrations/`, copy it the same way with the next timestamp, update `docs/DATA-MODEL.md`, and add tests.

## Run the tests

You need a PostgreSQL 16 server where the user can create databases. Each run creates and drops a throwaway database; on plain Postgres it first applies `tests/supabase-shim.sql` (roles `anon`, `authenticated`, `service_role`, `auth.uid()`); on a Supabase stack it uses the real ones. `0006_cron.sql` is skipped.

```bash
# any of these
supabase start                                   # then use its DB URL (port 54322)
docker run -d -p 54329:5432 -e POSTGRES_PASSWORD=postgres postgres:16

DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres pnpm --filter @tem/db test
```

Expected: 22 tests pass (schema rules, DST range, refunds, duplicate transactions, hold expiry, last-vehicle race, hold limit, VIP flag, RLS and staff rights, DEMO seed). The last-vehicle race test was checked by removing the class lock: it fails, as it should.

## Changing the schema

Never edit an applied migration. Add `0007_<name>.sql`, update `docs/DATA-MODEL.md`, add tests, run them. Then sync to `supabase/migrations/` (see above) and `supabase db push`.

## Staff

Staff are Supabase Auth users listed in `public.staff`. Only users in this table can use the admin app.

### Add a staff member

1. In the Supabase dashboard → **Authentication → Users**, create a user (email + password). Disable public sign-ups so only invited users exist.
2. Copy the user’s UUID.
3. In the SQL editor:

```sql
insert into public.staff (user_id, email, name)
values ('<auth user id>', 'office@example.com', 'Office');
```

### Remove a staff member

```sql
delete from public.staff where email = 'office@example.com';
```

Optionally delete or ban the Auth user so they cannot sign in again.

## DEMO seed

`seed/demo.sql`: 4 zones, 12 routes, 35 prices (one pair deliberately without a price to exercise `no_price`), 3 classes with 2 vehicles each, hourly rates (3–12 h), extras `night-surcharge` and `vip-security`. **Development and staging only** — never run on production. Production gets the client's real data. The launch guard (prompt 13) refuses a production build while any DEMO row remains.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/seed/demo.sql
```

## Generated types

```bash
pnpm db:types
```

Writes `apps/web/src/lib/server/database.types.ts` and `apps/admin/src/lib/database.types.ts`. Requires `supabase login` (or `SUPABASE_ACCESS_TOKEN`).
