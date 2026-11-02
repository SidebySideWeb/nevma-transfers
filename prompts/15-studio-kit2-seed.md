# 15 — Kit 2: Studio update, seed, tokens, types

Needs: kit 1 done (prompts 01–14); the kit 2 files copied over the repo; the Sanity project "Elite Protection" (see prompt 02). Produces: the extended Studio deployed, kit 2 DEMO content imported, a write token for forms, regenerated types. ~0.5 day.

--- PROMPT ---

Read `AGENTS.md` (kit 2 section), `docs/superpowers/specs/2026-11-01-tem-protection-kit2-content-site.md`, `docs/CONTENT-MODEL.md` and `docs/FORMS.md` first. The Studio changes are provided and validated (Sanity 6.21: 0 errors, 0 warnings, 22 tests, `sanity build` passes). **Do not redesign the schema.**

0. Database: apply `packages/db/migrations/0009_booking_reference_ep.sql` (new booking references start with `EP-`; sync it into `supabase/migrations/` as in prompt 04 and `supabase db push`; development first). Update any code or test that expects `TEM-` references to accept `EP-` for new bookings. Then reload the development demo data: the DEMO seed now follows the V2 design's fleet (`demo-e-class`, `demo-s-class`, `demo-v-class`, `demo-vito`, `demo-sprinter`; the no-price pair is `demo-north` → `demo-port` for `demo-sprinter`). Clear the demo rows (development only), re-apply `packages/db/seed/demo.sql`, and replace `demo-sedan`, `demo-suv`, `demo-van` in any test or fixture under `apps/` (`grep -rn "demo-sedan\|demo-suv\|demo-van" apps`).
1. `pnpm install`, then `pnpm --filter @tem/studio schema:validate` (0 errors, 0 warnings) and `pnpm --filter @tem/studio test` (22 pass).
2. Run the Studio locally and confirm the desk: Site settings, UI strings, Pages, Routes, Vehicle classes, then **Forms and submissions** → Form settings and, per form, New / In progress / Done / All. "Create new" must not offer Form submission, Site settings or UI strings. Site settings shows the "Show From prices" switch.
3. Re-import the seed: ask me to export an Editor token (`export SANITY_AUTH_TOKEN=...`), then `pnpm --filter @tem/studio seed` (`--replace` updates the kit 1 documents — the vehicle classes are now the five from the V2 design — and adds 6 standard pages, 4 routes, 3 forms; 27 photos from the V2 design). If any real content was already entered in the dataset, **stop and ask me first**: `--replace` overwrites documents with the same ids (`siteSettings`, `uiStrings`, `page-home`, legal pages, vehicle classes).
4. Confirm in the Studio: 118 UI strings; routes show `demo-airport → demo-centre` etc.; the contact form has 5 topics; no submissions exist.
5. Deploy the Studio (`pnpm --filter @tem/studio deploy`).
6. Ask me to create an **Editor** robot token named `tem-web-forms` and put it in `apps/web/.env` as `SANITY_WRITE_TOKEN` (and in Vercel later, prompt 23). Also set `PUBLIC_STUDIO_URL` to the deployed Studio URL. Check the read token used by the site is a **Viewer** token (it must not be able to create documents: try once with a test script and expect 403; never commit that script with a token).
7. Add the new GROQ queries to `apps/web/src/lib/sanity/queries.ts` with `defineQuery`: `PAGES_STANDARD_QUERY` (slug + sections with all section fields; `formBlock.form->` expanded; `routeList.routes[]->` expanded), `ROUTES_QUERY`, `ROUTE_BY_SLUG_QUERY`, `FEATURED_ROUTES_QUERY`, `FORMS_QUERY`, `FORM_BY_KEY_QUERY`, and extend `SITE_SETTINGS_QUERY` with `showFromPrices`. Run `pnpm --filter @tem/studio typegen`; commit the generated types.
8. Copy the new rules into `apps/web/src/styles/base.css`: the kit 2 component rules from `design/v2/build/v2.css` (navigation, mobile menu, breadcrumbs, feature grid, steps list, image-text, media, gallery, from-price, price table, facts, contact list, honeypot `.hp`). Tokens only.

Check (run and report pass/fail):
- Schema validate 0/0; Studio tests 22 pass; Studio deployed.
- Seed counts in step 4 match; `queries.test.ts` extended with: 6 standard pages, 4 routes, 3 forms — passes with the read token.
- Viewer token cannot write (403); the write token is only in `apps/web/.env` (git-ignored).
- `pnpm typecheck` passes.

Commit: `feat(studio): kit 2 content types, seed and queries`
