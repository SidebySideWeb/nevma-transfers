# V2-1 — Studio sections and the design's text in Sanity

Needs: front-end kit applied (prompt 15 at least). Produces: the 24 V2 section types in the Studio, every page's text from the design in Sanity, new `uiStrings` keys. ~0.5 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/DESIGN-V2.md`, `docs/DESIGN-V2-BLOCKS.md` and `v2-exact/README.md` first. Do not change the website (`apps/web`) in this prompt.

1. Merge, don't overwrite. These files came with the pack: `apps/studio/schemaTypes/sections/v2Sections.ts` (new), `apps/studio/schemaTypes/index.ts`, `page.ts`, `schema.test.ts`, `seed.test.ts`, `lib/uiStringDefaults.ts`, `apps/studio/scripts/import-v2-content.mjs` (new), `scripts/v2-content.mjs` (new), `scripts/v2-content.test.mjs` (new), `scripts/build-sanity-seed.mjs`, plus the rules and docs listed in `v2-exact/README.md`. Run `git diff` on the replaced files. If one of them had changes made in this repo after the front-end kit (extra keys, extra fields, extra page kinds), add those changes back on top of the pack version and tell me which ones you kept.
2. `page.sections` now offers only the V2 section types. The old section types (`hero`, `richText`, `ctaBand`, `faq`, `featureGrid`, `imageText`, `steps`, `vehicleClassList`, `routeList`, `contactDetails`, `formBlock`) stay registered so that old documents still open in the Studio; the import below replaces their sections.
3. Run `pnpm --filter studio test` and `node --test scripts/v2-content.test.mjs`. Both must pass. Then run `node --experimental-strip-types scripts/build-sanity-seed.mjs` to rebuild the seed (`seed/tem-seed.tar.gz`) for fresh environments. It must write 27 documents.
4. `pnpm --filter studio build`, then deploy the Studio (`pnpm --filter studio exec sanity deploy`). Ask me before you deploy.
5. Import the content into the existing dataset. **Ask me before each command; I run it signed in with Editor rights:**
   - Dry run: `pnpm --filter studio import:v2` must list 13 pages (home, fleet, services, vip-security, about, contact, request-a-transfer, vehicle, legal, terms, cancellation, privacy, cookies), the photos and the new `uiStrings` keys. If it reports a missing form or route, stop and tell me.
   - Write: `pnpm --filter studio import:v2 -- --apply --use-design-copy`.
6. In the Studio, open Home and check that the first section is "Page hero" with the heading "Discreet luxury, *door to door.*" and that all 8 sections appear in the design's order. Then open Settings → UI strings and check that `booking.pickup.zone` reads "Pick-up zone".

Check (run and report pass/fail):
- Studio tests, `scripts/v2-content.test.mjs` (24 tests), and `scripts/kit-consistency.test.mjs` pass.
- The import dry run and the real run both finished without errors. Paste their summary lines.

Commit: `feat(studio): V2 design sections and content`
