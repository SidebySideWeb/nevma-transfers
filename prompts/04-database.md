# 04 — Database: Supabase project, migrations, DEMO seed, types

Needs: 01; a Supabase project (Pro, EU Frankfurt) and the Supabase CLI logged in; Docker for local tests (or any PostgreSQL 16). Produces: schema applied locally and in the project, DEMO data in development, generated types for web and admin. ~0.5 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/DATA-MODEL.md`, `packages/db/README.md` and every file in `packages/db/migrations/` first. The migrations are provided and tested (22 tests pass on PostgreSQL 16). **Do not edit them.** If something must change, write `0007_...sql`, update `docs/DATA-MODEL.md` and add a test.

1. Run the provided tests locally: start `supabase start` (or `docker run -d -p 54329:5432 -e POSTGRES_PASSWORD=postgres postgres:16`) and run `DATABASE_URL=<that url> pnpm --filter @tem/db test`. All 22 must pass. They prove AC-02 (no overlap per vehicle), AC-03 (type rules), AC-04 (hold expiry), AC-05 (last-vehicle race, hold limit), AC-07 (duplicate transaction, idempotency key), AC-08 (refund limit), AC-09 (VIP flag), AC-10 (RLS and staff rights) and AC-14 (DST range).
2. Wire the Supabase CLI: `supabase init` at the root if needed, then make `supabase/migrations/` use the provided files (copy `packages/db/migrations/0001..0006` with Supabase's timestamped names, keeping the order; add a note in `packages/db/README.md` that `packages/db/migrations` is the source and how to sync). Do not change SQL content.
3. In the Supabase dashboard enable `pg_cron` (Database → Extensions) before pushing, then `supabase db push`. Confirm in the SQL editor: 14 tables in `public`, RLS on all of them, the cron job `tem-expire-holds` listed in `cron.job`.
4. Seed the **development** project only: run `packages/db/seed/demo.sql` (never on production). Confirm 4 zones, 12 routes, 35 prices, 3 hourly rates, 2 extras, 6 vehicles.
5. Staff: ask me to create my staff user in Supabase Auth (email + password), then insert it into `public.staff` with the SQL editor. Document the steps for adding and removing staff in `packages/db/README.md`.
6. Types: `supabase gen types typescript --project-id <id> --schema public > apps/web/src/lib/server/database.types.ts` and the same file for `apps/admin/src/lib/database.types.ts`. Add the command as `pnpm db:types` in the root `package.json`.
7. `apps/web/src/lib/server/supabase.ts`: `getServiceClient()` (service role, server only, `auth: { persistSession: false }`), typed with `Database`. Add a guard so importing it from a client component fails the build.
8. A typed helper `apps/web/src/lib/server/settings.ts`: `getSettings(): Promise<{ holdMinutes; minLeadMinutes; cancelWindowHours; maxActiveHoldsPerVisitor; timezone }>` reading `settings`, cached 60 s.

Check (run and report pass/fail):
- `pnpm --filter @tem/db test`: 22 pass.
- Supabase project: 14 tables with RLS, cron job present, DEMO data counts as in step 4 (development only).
- As anon (`curl` the REST endpoint with the anon key): every table returns an error or no rows.
- `pnpm typecheck` passes with the generated types.

Commit: `feat(db): apply migrations, DEMO seed, generated types`
