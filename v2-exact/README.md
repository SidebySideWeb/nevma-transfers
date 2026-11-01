# Elite Protection V2: exact rebuild of the website

Version 1.0, 1 Nov 2026. For a repo where the front-end kit has already been run and the website does not match the V2 design.

## Why the first build drifted

The front-end kit told Cursor that the V2 pages were "a visual target, not code", and an always-on Cursor rule said "match `design/screens` and use only tokens, no hex values, no pixel sizes". It also gave it generic blocks (hero, feature grid, image and text). Cursor redrew every page from screenshots with its own markup and tokens, so spacing, type sizes, layouts and most of the text drifted. The design export could not simply be copied either: its pages are drawn by a small runtime, with about 70% of the styling inline on each element.

## What this pack changes

- **`design/v2/build/`**: every page and state of the design as clean static HTML plus one stylesheet. It is pixel-identical to the design at 1440 and 390 px (0.000% difference, checked). Each block is cut into its own file in `blocks/`, and `web/v2.css` uses production paths.
- **Sanity**: 24 section types, one per design block (`apps/studio/schemaTypes/sections/v2Sections.ts`). The design's text goes into Sanity, block by block, through `scripts/v2-content.mjs`, and 158 new `uiStrings` keys carry the design's labels for the booking flow, return pages, forms, header and footer.
- **Sanity seeded from the design, text and photos**: `apps/studio/scripts/import-v2-content.mjs` writes the 13 page documents into your existing dataset and uploads the design photos they use (dry run first). Fresh environments get the same content from `seed/tem-seed.tar.gz` (27 documents, 29 photos). `scripts/v2-content.test.mjs` fails if any line of the design's text is missing from Sanity or `uiStrings`.
- **A test that decides "done"**: `design/v2/web-tests/v2-fidelity.spec.ts` compares the built site with the build, block by block, at 1440 and 390 px. It checks block order, height (within 2%), text, and pixels: at most 0.1% of a block may differ, with photos blanked on both sides. A 1 px change in a heading size or a button's padding fails it (checked). Served as the "site", the design itself passes all 40 cases.
- **Cursor rules fixed**: the always-on rule now says the website is a port of `design/v2/build`, and a new rule `25-website-v2.mdc` applies to `apps/web`.
- **Prompts V2-1 to V2-7**: Cursor ports the markup and wires the data. It does not redraw anything.

## Run in Cursor, in this order

| # | Prompt | Result | ~Time |
| --- | --- | --- | --- |
| V2-1 | `PROMPT-V2-1-studio-content.md` | Studio sections, design text in Sanity (import script, dry run first) | 0.5 d |
| V2-2 | `PROMPT-V2-2-foundation.md` | `v2.css`, fonts, photos, layout, header, mobile menu, footer, `Sections.astro`, fidelity test wired in | 1 d |
| V2-3 | `PROMPT-V2-3-home.md` | Home: 8 blocks, quick-booking widget with hourly switch | 1 d |
| V2-4 | `PROMPT-V2-4-fleet-vehicle.md` | `/fleet` and `/fleet/[key]` | 1 d |
| V2-5 | `PROMPT-V2-5-content-pages.md` | Services, routes, VIP Security, About, Contact, Request a transfer, legal | 1.5 d |
| V2-6 | `PROMPT-V2-6-booking-and-returns.md` | `/book` (four steps, hand-off), confirmed, not completed, hold expired, request received, find, manage, cancel, 404/500 | 2 d |
| V2-7 | `PROMPT-V2-7-qa-cleanup.md` | Full fidelity run, accessibility, Lighthouse, old components removed | 0.5 d |

Copy the pack over the repo root first. It adds files and replaces only these: `apps/studio/schemaTypes/{index.ts,page.ts,schema.test.ts,seed.test.ts,lib/uiStringDefaults.ts}`, `apps/studio/package.json` (one script added), `scripts/build-sanity-seed.mjs`, `docs/DESIGN-V2.md`, `docs/DESIGN-SYSTEM.md`, `AGENTS.md` (one line), the Cursor rules `.cursor/rules/00-project.mdc` and `20-css-design.mdc` (they told Cursor to use tokens and the old wireframes for everything, which is how the first build drifted) plus the new `25-website-v2.mdc`, the old prompts 17–20, 22, 25 and 30 (a "superseded" note at the top) and the seed in `seed/`. If Cursor changed any of these files in your repo, let V2-1 merge them; don't overwrite blindly.

Checks after each prompt: `pnpm test`, `pnpm lint`, `pnpm typecheck`, and the fidelity test for the pages that prompt covers.
