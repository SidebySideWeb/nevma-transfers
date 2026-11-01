# V2-7 — Fidelity QA and cleanup

Needs: V2-1 to V2-6. Produces: every page passes the fidelity test, the old redrawn components are gone, the report for the client review. ~0.5 day.

--- PROMPT ---

Read `docs/DESIGN-V2.md` and `v2-exact/README.md`.

1. Run the whole `v2-fidelity.spec.ts` (20 cases × 2 widths) against a production build (`PUBLIC_V2_PREVIEW=1` only for this run).
   - Fix every failure in the markup; don't loosen the limits.
   - If a difference is a decided one (see "Where the site differs" in `docs/DESIGN-V2.md`) and the test does not know it yet, tell me before adding it to `ALLOWED_TEXT_CHANGES`.
2. Delete the components, styles and section renderers that the V2 blocks replaced, for example the old `Hero`, `FeatureGrid`, `ImageText`, `Steps`, `VehicleClassList`, `RouteList`, `ContactDetails`, `FormBlock`, the kit 2 `Header`/`Footer` and the token-based page CSS. First list each file with what replaced it, and wait for my OK. Keep the admin's design system untouched.
3. Search `apps/web/src` for leftovers:
   - hard-coded user-facing strings outside `uiStrings`/Sanity;
   - `style=` attributes other than `--bg-image`;
   - class names that are not in `v2.css` on public pages. Write a small script `scripts/check-v2-classes.mjs` and add it to `pnpm lint`. It allows classes from `v2.css` and a short allow-list for JS hooks with the prefix `js-`.
4. Lighthouse mobile on `/`, `/fleet`, `/book`: performance ≥ 90, accessibility 100. Images use the Sanity CDN with width parameters; only the hero photo is eager.
5. Screenshots for my client review: `/`, `/fleet`, `/fleet/v-class`, `/services`, `/vip-security`, `/about`, `/contact`, `/book` (each step) at 1440 and 390 px, into `docs/v2-review/`, next to the matching `design/v2/screenshots/*.jpg`.
6. Update `docs/DECISIONS.md`: "Website built by porting `design/v2/build`; fidelity test is the definition of done."

Check (run and report pass/fail):
- `v2-fidelity.spec.ts`: 40/40 pass. Paste the summary.
- axe clean on every public route at 390, 1024 and 1440 px; no horizontal scroll at 390 px.
- `pnpm test`, `pnpm lint` (with the class check), `pnpm typecheck` and `pnpm build` pass.

Commit: `chore(web): V2 fidelity QA and removal of the redrawn components`
