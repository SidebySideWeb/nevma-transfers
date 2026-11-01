# 17 — Navigation and the new page sections

Needs: 15, 16. Produces: header navigation with phone menu, footer links, breadcrumbs, and one Astro component per kit 2 section type. ~1 day.

--- PROMPT ---

Design target: the V2 pages for these routes listed in `docs/DESIGN-V2.md` (in `design/v2/pages/`, screenshots in `design/v2/screenshots/`), built with the components from prompt 30; the older `design/screens/` wireframes only show structure and string keys.

Read `AGENTS.md`, `docs/CONTENT-MODEL.md` (page sections), `docs/PAGES.md` (kit 2: navigation) and open `design/screens/fleet.html`, `services.html`, `vip-security.html`, `contact.html` at 390 px and 1440 px first. Match them; tokens only; every label through `t()` (keys in areas `site` and `forms`).

1. `Header.astro`: links `nav.fleet`, `nav.services`, `nav.vipSecurity`, `nav.about`, `nav.contact` with `aria-current="page"` on the active section (a route page counts as Services, a vehicle page as Fleet); `nav.book` button → `/book`, replaced by "Request a quote" → `/request-a-transfer` when `PUBLIC_BOOKING_OPEN` is false. Below 960 px a `<details>` menu (`nav.menu`) with the same links: works without JavaScript; a tiny script closes it on Escape and on link click and returns focus to the summary.
2. `Footer.astro`: add the same five links above the legal links.
3. `Breadcrumbs.astro`: `<nav aria-label="Breadcrumb"><ol>` with `site.breadcrumb.home`; the last item has `aria-current="page"`; also emits `BreadcrumbList` JSON-LD.
4. Section components in `src/components/sections/` and registered in `Sections.astro` (kit 1): `FeatureGrid.astro`, `ImageText.astro` (image side, CTA targets `book` → `/book`, `quote` → `/request-a-transfer`, `url`), `Steps.astro` (ordered list), `VehicleClassList.astro` (uses `getPublishableClasses()` and `priceLabel()`; card links to `/fleet/<key>`), `RouteList.astro` (references or, when empty, featured routes; only publishable routes; duration with `site.duration`; lowest price with `priceLabel`), `ContactDetails.astro` (from `siteSettings`; `tel:` and `mailto:` links; hours when `showHours`), `FormBlock.astro` (a placeholder that renders the form's title and intro now; prompt 22 adds the fields).
5. A unit test for `Sections.astro` that renders a fixture page containing every section type in order (extend the kit 1 test).
6. ESLint rule (AC-34): forbid string literals in JSX/Astro text of `src/components/sections/**` and `Header`/`Footer` (use `eslint-plugin-astro` + `no-restricted-syntax` or a small custom rule); allow empty strings and class names.

Check (run and report pass/fail):
- Tests pass; lint passes with the AC-34 rule enabled.
- Kitchen sink (`/dev/kitchen-sink`) shows every new section with DEMO data at 390 px and 1440 px with no horizontal scroll; the phone menu opens and closes with keyboard and mouse.
- axe: no serious or critical issues on the kitchen sink.

Commit: `feat(ui): navigation, breadcrumbs and kit 2 sections`
