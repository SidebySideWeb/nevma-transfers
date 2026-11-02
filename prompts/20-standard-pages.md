# 20 — VIP security, About and Contact pages

> **Superseded for the look (1 Nov 2026).** The website must be an exact port of `design/v2/build`. If you have not run this prompt yet, run `v2-exact/` V2-5 instead for every visual part, and take only the behaviour, data and test steps from here. If you already ran it, `v2-exact/` replaces its markup and styles.

Needs: 17. Produces: the three standard pages rendered from Sanity sections (forms are wired in prompt 22). ~0.5 day.

--- PROMPT ---

Design target: the V2 pages for these routes listed in `docs/DESIGN-V2.md` (in `design/v2/pages/`, screenshots in `design/v2/screenshots/`), built with the components from prompt 30; match those V2 pages exactly.

Read `AGENTS.md`, `docs/PAGES.md` (kit 2), `docs/ACCEPTANCE.md` (AC-33, AC-34) and open `design/v2/pages/05-vip-security.html` and `design/v2/pages/07-contact.html` first.

1. One generic route `src/pages/[standard].astro` with `getStaticPaths` for the standard pages that have no dedicated route: `vip-security`, `about`, `contact`, `request-a-transfer`. (Fleet and services keep their own routes from prompts 18 and 19; make sure the paths do not collide.) Each renders `page.sections` with `Sections.astro`. A missing page fails the build with a clear message.
2. `/vip-security`: the `formBlock` section renders inside an element with `id="enquiry"` (the hero CTA links there). JSON-LD `Service` (name from the page title, provider Organization, `areaServed` Athens), no price.
3. `/about`: JSON-LD `Organization` (from `siteSettings`).
4. `/contact`: JSON-LD `Organization` with `contactPoint` (telephone, email, `contactType: customer service`, `availableLanguage: English`).
5. Make sure the kit 1 legal route `[legal].astro` and this `[standard].astro` cannot both claim a slug (use explicit path lists, not catch-alls).

Tests:
- Playwright: each page renders its DEMO sections in order; the VIP hero button scrolls to `#enquiry` and focus lands on the form heading.
- AC-33: axe clean on all four pages; unique titles, descriptions and canonicals; all in the sitemap; JSON-LD parses.
- AC-34: lint passes (no literals in sections).

Check (run and report pass/fail):
- Tests pass; pages match the wireframes at 390 px and 1440 px.

Commit: `feat(site): VIP security, About and Contact pages`
