# 03 — Design foundation: tokens, fonts, base CSS, layout, strings helper

Needs: 01, 02. Produces: shared look for web and admin, base layout, header, footer, error pages, the `t()` strings helper. ~1 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/DESIGN-SYSTEM.md`, `docs/PAGES.md` (shared layout), `design/tokens.css`, `design/v2/build/v2.css` and open `design/v2/pages/01-home.html` first.

1. Copy `design/tokens.css` to `apps/web/src/styles/tokens.css` and `apps/admin/src/styles/tokens.css` unchanged. Add a test `apps/web/src/styles/tokens.test.ts` that fails if the two copies differ from `design/tokens.css` (so the brand swap stays one change).
2. Fonts: self-host Jost and Playfair Display from `design/v2/pages/assets/fonts/` in `apps/web/public/fonts/` and `apps/admin/public/fonts/` with `@font-face` (`font-display: swap`) in `base.css`; preload Jost 400 and Playfair 500. (Projects built before 1 Nov: prompt 30 does this.)
3. `apps/web/src/styles/base.css`: port the `@layer base` and `@layer components` rules from `design/v2/build/v2.css` that the public site needs (header, footer, buttons, hero, section, card, grid, steps, segmented, field, input, check, vehicle, timer, notice, summary, total, badge, spinner, utilities). Tokens only: no hex, no raw pixel values except 1 px borders. Keep the text-wrap rules.
4. `apps/web/src/lib/strings.ts`: `t(key: UiStringKey, vars?: Record<string, string | number>): string`. Import the defaults from `apps/studio/schemaTypes/lib/uiStringDefaults.ts` (do not copy the list; use a TS path alias `@studio-strings` and, if Vite blocks the file in dev, add the Studio folder to `vite.server.fs.allow`); `UiStringKey` is the union of its keys. Values from Sanity (`UI_STRINGS_QUERY`, loaded once per build or cached 5 minutes on the server) override the defaults. Placeholders `{name}` are replaced; a missing placeholder variable throws in tests and leaves the brace text in production. Tests: default used when Sanity has no value; Sanity value wins; placeholders filled; unknown key is a type error (`// @ts-expect-error`).
5. `apps/web/src/layouts/BaseLayout.astro`: `<html lang="en">`, title and meta from props with `siteSettings.defaultSeo` fallback, canonical, Open Graph, robots prop (default `index`), skip link to `#main`, `<Header>` and `<Footer>`.
   - `Header.astro`: company name or logo from `siteSettings`, phone `tel:` link, "Book now" → `/book`.
   - `Footer.astro`: company name, address, phone, email, opening hours, links to `/privacy`, `/cookies`, `/terms`, `/cancellation`, a "Cookie settings" button (no-op until a consent tool is chosen).
6. `src/pages/404.astro` and `src/pages/500.astro` (500 makes no data calls), both `noindex`.
7. `src/pages/dev/kitchen-sink.astro` (only built when `import.meta.env.DEV`): every component state from the wireframes, for visual review.
8. Admin: copy `design/admin/admin.css` (without the board chrome block) to `apps/admin/src/styles/admin.css` and build `AdminLayout.astro` matching `design/admin/bookings.html` (rules: `docs/DESIGN-ADMIN.md`; nav items as in `docs/PAGES.md`). If the admin was already built with the older wireframes, prompt 26 restyles it.

Check (run and report pass/fail):
- `pnpm --filter @tem/web test` (tokens, strings) and `pnpm typecheck` pass.
- `grep -rnE "#[0-9a-fA-F]{3,8}\b" apps/web/src apps/admin/src --include=*.css --include=*.astro --include=*.tsx` finds nothing outside `tokens.css`.
- Kitchen sink at 390 px and 1440 px: no horizontal scroll; focus visible on every control.
- Header and footer show the DEMO phone and email from Sanity.

Commit: `feat(ui): tokens, base styles, layout, strings helper`
