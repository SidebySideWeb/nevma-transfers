# 02 — Sanity Studio, DEMO seed import, deploy, typegen

Needs: 01; the Sanity project "TEM Protection" created (note the Project ID), dataset `production` set to **private**; an Editor API token for the import only. Produces: Studio running locally and deployed, DEMO content in `production`, a read token for the site, generated types. ~0.5 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/CONTENT-MODEL.md` and the files in `apps/studio/` first. The schema is provided and validated with Sanity 6.21 (0 errors, 0 warnings, 14 tests). **Do not redesign it.**

1. In `apps/studio/.env` I will set `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET=production` (ask me to do it; do not write the values yourself). Then run `pnpm --filter @tem/studio schema:validate` (must be 0 errors, 0 warnings) and `pnpm --filter @tem/studio test`.
2. Run `pnpm --filter @tem/studio dev` and confirm the desk structure: Site settings and UI strings open directly as single documents (no delete or duplicate actions), then Pages and Vehicle classes. "Create new" must not offer Site settings or UI strings.
3. Import the DEMO seed. Ask me to export a token in the terminal (`export SANITY_AUTH_TOKEN=...`), then from `apps/studio` run `pnpm seed` (imports `../../seed/tem-seed.tar.gz` into `production` with `--replace`). If the CLI rejects a flag, check `npx sanity datasets import --help` and adapt. If images fail, re-run once with `--allow-failing-assets` and tell me which failed. Never print the token or write it to a file.
4. In the Studio, confirm: 10 documents (site settings, UI strings with 69 strings, 3 vehicle classes `demo-sedan`, `demo-suv`, `demo-van` with 2 photos each, home and 4 legal pages), every image has alt text, every document's "Internal note" says DEMO.
5. Deploy the Studio: `pnpm --filter @tem/studio deploy` (pick a hostname such as `tem-protection`). Add the site and admin URLs (localhost and production) to the project's CORS origins without credentials.
6. Ask me to create a **Viewer** robot token named `tem-web-read` and put it in `apps/web/.env` and `apps/admin/.env` as `SANITY_READ_TOKEN`, with `SANITY_PROJECT_ID` and `SANITY_DATASET`.
7. Typegen: create `apps/web/src/lib/sanity/client.ts` (`@sanity/client`, `useCdn: false` at build, `perspective: 'published'`, token from env, API version `2026-10-01`) and `apps/web/src/lib/sanity/queries.ts` with `defineQuery` queries: `SITE_SETTINGS_QUERY`, `UI_STRINGS_QUERY`, `VEHICLE_CLASSES_QUERY` (key, name, tagline, photos with asset url and alt, specs, sortOrder), `PAGE_BY_SLUG_QUERY`. Then `pnpm --filter @tem/studio typegen` writes `apps/web/src/sanity/sanity.types.ts`. Commit the generated file.
8. Add `apps/web/src/lib/sanity/queries.test.ts` that runs the four queries against the dataset when `SANITY_READ_TOKEN` is set (skip otherwise) and asserts: settings has a phone and booking notification email; 69 strings; 3 classes with keys `demo-sedan`, `demo-suv`, `demo-van`; page `home` has a hero section.

Check (run and report pass/fail):
- Schema validate: 0 errors, 0 warnings; Studio tests pass.
- Seed imported: counts in step 4 match; Studio deployed and opens.
- `sanity.types.ts` generated and committed; `pnpm --filter @tem/web typecheck` passes.
- `queries.test.ts` passes with the token set.
- No token appears in git history (`git log -p | grep -i token` shows only variable names).

Commit: `feat(studio): seed import, deploy, typed queries`
