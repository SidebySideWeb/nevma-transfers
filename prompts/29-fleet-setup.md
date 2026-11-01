# 29 — Fleet and setup management in the admin

> Already done if you ran design/admin/PROMPT-3-fleet-setup.md from the admin update: skip this prompt.

Needs: kit 1 prompts 04 and 11; the admin design prompt (26) for the components. Produces: migration 0012 applied, add and edit for vehicle classes, vehicles, zones and extras, the class page with the "Ready for customers?" checklist, and Sanity links. ~1.5 days.

--- PROMPT ---

Read `AGENTS.md`, `.cursor/rules/80-admin-app.mdc`, `docs/FLEET-SETUP.md` (all of it), `docs/DESIGN-ADMIN.md`, `packages/db/migrations/0012_setup_guards.sql` and `packages/db/tests/setup.test.mjs`, and open `design/admin/fleet.html`, `fleet-class.html`, `setup-dialogs.html`, `zones.html`, `extras.html` first. Tests first. All writes use the signed-in staff session; the database guards are the source of truth, the UI only repeats them.

1. Database: sync `0012_setup_guards.sql` into `supabase/migrations/` as in prompt 04, run the db tests, `supabase db push` (development first), regenerate types.
2. Errors: a helper that maps database errors to messages for the admin: messages starting `in_use:` or `has_future_bookings:` are shown as they are (without the prefix); `23505` on `vehicles_label_key` → "That label is already used"; `23514` → the field's own validation text. Never show raw SQL errors.
3. `/fleet`: classes and vehicles tables as on the board; Add class and Add vehicle dialogs (`ConfirmDialog`-style forms with zod validation: key pattern `^[a-z0-9]+(-[a-z0-9]+)*$`, numbers in range); vehicle label opens Edit vehicle (label, class, model/plate note, status via `Select`); Delete only offered when the thing was never used (the database decides; on `in_use` show the message and offer "Retire" / "Switch offline" instead).
4. `/fleet/[key]`: booking details form (key read-only once used — ask the database by trying nothing: show read-only when vehicles, prices, rates or bookings exist), vehicles in the class with future booking counts, Website content panel (server-side GROQ with the read token: `*[_type == "vehicleClass" && key == $key][0]{name, "photos": count(gallery), _updatedAt}`; Studio link `PUBLIC_SANITY_STUDIO_URL/intent/edit/id=<id>;type=vehicleClass` or `/intent/create/template=vehicleClass` when missing), Prices panel (counts from `zone_prices` / `hourly_rates`), "Ready for customers?" checklist from those facts. Add `vehicles.note` only if your schema lacks a staff note column (model, colour, plate): new migration, staff column grant, test.
5. `/zones`: Add zone dialog, inline rename and order, on/off switch; `/extras`: Add extra dialog, price and on/off inline; built-in extras show a "Built in" flag and no delete.
6. Banner: add "Class X is online but not ready: <missing items>" to the existing banner checks.

Tests:
- db: `setup.test.mjs` passes.
- Vitest: the error-mapping helper; the readiness checklist from given facts (no vehicle, no price, no Sanity photos, offline).
- Playwright: add class `limo` (offline) → add vehicle LIMO-1 → add an hourly rate → the checklist shows only the Sanity item missing; try to retire a vehicle with a future booking → the message appears and nothing changes; rename an unused zone code; delete a never-used extra; axe on the new screens at 390/1024/1440 px.

Check (run and report pass/fail):
- Tests, `pnpm lint`, `pnpm typecheck` pass.
- The office can add a vehicle and see it on the calendar without a deploy.
- No service role key in the admin build (AC-24).

Commit: `feat(admin): fleet, zones and extras management`
