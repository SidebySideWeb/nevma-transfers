# Elite Protection — Cursor build kit 2: content site and forms

Version 1.0, 1 Nov 2026. An add-on to kit 1 (booking core). Same repo, same Sanity Studio, same tokens, no database migration.

Kit 2 adds the rest of the website: `/fleet`, `/fleet/[key]`, `/services`, `/routes/[slug]`, `/vip-security` (with enquiry form), `/about`, `/contact` (form with topics), `/request-a-transfer` (quote form), `/thank-you/[form]`. Form submissions are stored in Sanity (per form, with New / In progress / Done) and emailed to the office.

## Install over your repo

1. Commit or stash your work first.
2. Unzip `tem-protection-kit2.zip` and copy the **contents** of `tem-platform/` over your project folder, hidden files included. It only replaces kit-owned files: `apps/studio/**` (schemas, structure, config), `seed/**`, `design/**`, `docs/**`, `prompts/**`, `scripts/**`, `packages/db/tests/seed.test.mjs`, `.cursor/rules/30-sanity.mdc`, `AGENTS.md`, `.env.example`, `README-KIT2.md`. It does not touch `apps/web`, `apps/admin` or `packages/db/migrations`.
3. If Cursor had changed any of those files during kit 1, compare with `git diff` before committing and keep your intended changes.
4. Run `pnpm install && pnpm test` (with `DATABASE_URL` set for the database tests).
5. Run `prompts/15-studio-kit2-seed.md` → `24-qa-kit2.md` in order, as before.

## What is new or changed

| Area | Change | Status |
| --- | --- | --- |
| `apps/studio` | new types `route`, `form`, `formSubmission`; 7 new page sections; `page.kind` adds `standard`; `siteSettings.showFromPrices`; `uiStrings` areas `site` and `forms` (118 keys in total); desk "Forms and submissions" per form and status; submissions cannot be created by hand | validated: 0 errors, 0 warnings, 22 tests, `sanity build` passes |
| `seed/` | 25 documents (5 vehicle classes from the V2 design, 6 standard pages, 4 routes, 3 forms), 27 photos from the V2 design | checked against the schema; route zone codes checked against the SQL seed |
| `design/` | 8 new wireframes (fleet, vehicle, services, route, VIP security, contact, request a transfer, thank you) and their CSS | 390 and 1440 px: no overflow, zero serious axe issues |
| `docs/` | new `FORMS.md`; `CONTENT-MODEL`, `PAGES`, `ARCHITECTURE` §10, `DECISIONS` (P14–P21, O14–O17), `ACCEPTANCE` (AC-25 to AC-34) updated; kit 2 spec in `docs/superpowers/specs/` | |
| `prompts/` | 15–24; `00-HOW-TO-RUN.md` lists them | consistency-tested |
| `.env.example` | `SANITY_WRITE_TOKEN`, `PUBLIC_STUDIO_URL`, `TEM_WEB_DEPLOY_HOOK_URL` | |

## Choices made for you (change any of them)

"From" prices on fleet and route pages, read at build time, with an on/off switch in Site settings · after a price change the admin offers "update the website" · forms and submissions in Sanity like Nevma Music, wording and recipients editable · 24-month retention (DEMO) · no testimonials until the client sends real ones. Full list: `docs/DECISIONS.md` (P14–P21) and the open client questions O14–O17.
