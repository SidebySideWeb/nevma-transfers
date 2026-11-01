# V2-2 — Foundation: the design's stylesheet, layout, header, footer and the fidelity test

Needs: V2-1. Produces: every public page uses the design's own CSS and markup for header, mobile menu and footer; `Sections.astro` maps the V2 types; the fidelity test runs. ~1 day.

--- PROMPT ---

Read `AGENTS.md`, `.cursor/rules/25-website-v2.mdc`, `docs/DESIGN-V2.md` (all of it, especially "The rule: port the markup, do not redraw it"), `docs/DESIGN-V2-BLOCKS.md`, then open `design/v2/build/01-home.html`, `design/v2/build/01-home-navopen.html` (at 390 px) and `design/v2/build/blocks/01-home/00-siteHeader.html` and `09-siteFooter.html`.

The website was first built from screenshots and does not match the design. From now on the markup and CSS in `design/v2/build` **are the code**: you copy their elements, nesting, class names and `data-block` attributes exactly, and replace only text, links, images and repeated items with data. Do not restyle, rename classes, convert to tokens or Tailwind, or "improve" spacing. If the design markup and an accessibility rule conflict, keep the classes and add the attribute (for example `aria-current`, a `<label>`), never a new wrapper with new styles.

1. Styles and assets.
   - Copy `design/v2/build/web/v2.css` unchanged to `apps/web/src/styles/v2.css` and import it in the public layout, after the existing global CSS.
   - Copy `design/v2/pages/images/*` to `apps/web/public/images/v2/` (fallbacks, logo) and the fonts to `apps/web/public/fonts/`. Write `apps/web/src/styles/fonts.css` from `design/v2/pages/assets/fonts.css` with `/fonts/` paths.
   - Remove the old public-page styles and components that redraw the design (keep the admin's). List them for me before you delete anything.
   - CSP: add `style-src 'self' 'unsafe-inline'` (needed for `--bg-image`); keep everything else.
2. `PublicLayout.astro` takes `designPage` (for example `"01-home"`) and renders `<body class={"pg-" + designPage}>`, plus the root wrappers exactly as the build files have them (`<div id="dc-root"><div class="…">`, with the same classes). Every public page passes its design page from the table in `docs/DESIGN-V2.md`.
3. `src/components/v2/SiteHeader.astro` from `blocks/01-home/00-siteHeader.html`.
   - Links: `nav.*` from `uiStrings`, routes instead of `.html` files. `aria-current="page"` on the active section (a route page counts as Services, a vehicle page as Fleet).
   - Phone from `siteSettings.phone`. "Book" uses `nav.book`; when `PUBLIC_BOOKING_OPEN` is false it reads "Request a quote" and links to `/request-a-transfer`.
   - Mobile menu: the open state is the overlay in `01-home-navopen.html`. Port it into the header. The burger toggles it (`aria-expanded`, focus moves into the menu, Escape closes it and returns focus, links close it). It must work without JavaScript as a link to `#menu` with `:target`, or keep the `<details>` fallback using the overlay's classes.
4. `SiteFooter.astro` from `blocks/01-home/09-siteFooter.html`. Text from `site.footer.*` (`{year}` is the current year), phones and email from `siteSettings`.
5. `src/components/v2/Heading.astro` renders a `displayHeading` (`before`, `accent`, `after`) the way each block file writes it. Look at each block: most use `before<br><em>accent</em>`, some put `after` on the same line. Add a `variant` prop for the patterns you find; never add classes. `t()` gets a helper `tAccent(key)` that turns `*words*` into `<em>words</em>` safely (escape first).
6. `src/components/v2/CtaLink.astro` turns a `ctaLink` into an `<a>` with the classes passed by the block (targets in `docs/DESIGN-V2-BLOCKS.md`).
7. `Sections.astro`: map every V2 `_type` to its component in `src/components/v2/blocks/`. For now, create each component as a stub that renders the block file's markup with the Sanity data for the obvious single fields (eyebrow, heading, lead, buttons, image), so every page already renders in the right order. Prompts V2-3 to V2-6 finish them.
8. Photos: helper `bgImage(image, width)` returns `--bg-image:url(<Sanity CDN url with w, auto=format, q=75>)` for background blocks. Use `urlFor` with `width` and `srcset` for `<img>`. The design photo stays as the CSS fallback.
9. Fidelity test.
   - Add `pixelmatch` and `pngjs` (+ `@types/pngjs`) as dev dependencies of `apps/web`.
   - Copy `design/v2/web-tests/v2-fidelity.spec.ts` to `apps/web/tests/v2/` and add a Playwright project `v2` that runs it against the built preview (`astro build && astro preview`).
   - Set the vehicle route in its `CASES` to a real class key (for example `/fleet/v-class`).
   - The `/dev/v2/*` cases fail until V2-6; mark them `test.fixme` until then.

Tests:
- Vitest: `tAccent` escapes HTML and renders `*a*` as `<em>a</em>`; `CtaLink` resolves every target; `bgImage` builds the CDN URL.
- Playwright `v2` project on `/`: the blocks `siteHeader`, `pageHero` … `siteFooter` exist in the design's order (the pixel checks may still fail for the blocks finished in V2-3).

Check (run and report pass/fail):
- The fidelity test passes for `siteHeader` and `siteFooter` on `/` at 1440 and 390 px (pixels and text). Paste the per-block results for the rest; they are the to-do list for V2-3 to V2-6.
- The mobile menu opens and closes by keyboard and mouse at 390 px and looks like `01-home-navopen`.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` pass.

Commit: `feat(web): V2 stylesheet, layout, header, footer and fidelity test`
