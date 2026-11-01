# 23 — Admin additions, SEO, webhooks and launch guard for kit 2

Needs: 18–22; kit 1 admin (prompt 11) and deploy (prompt 13). Produces: the admin's "update the website" banner and route checks, sitemap and structured data complete, webhooks and env vars in Vercel, launch guard extended. ~0.5 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/ARCHITECTURE.md` §10, `docs/PAGES.md` (admin banners), `docs/ACCEPTANCE.md` (AC-31, AC-32, AC-33) first. Ask before any command that changes cloud resources; never print secrets.

1. Admin (AC-31): after any successful save on `/prices`, `/hourly-rates`, `/extras`, `/fleet`, `/zones` (and routes/durations), set a signed cookie `prices_changed=1` and show a banner "Prices changed: update the website" with a button. The button posts to an admin action that calls `TEM_WEB_DEPLOY_HOOK_URL` from the server (env only in `apps/admin` server), clears the flag, and stores `rebuild_requested_at` in a signed cookie; the button is disabled with a short note for 2 minutes after use. A hook failure shows an error and keeps the flag.
2. Admin (AC-32): the existing banner also lists Sanity routes whose `fromZone`/`toZone` do not exist in `zones` or have no `zone_routes` row (read routes from Sanity with the read token on the server, cached 5 minutes).
3. SEO (AC-33): `sitemap.xml` contains home, legal pages, `/fleet`, every `/fleet/<key>`, `/services`, every published route, `/vip-security`, `/about`, `/contact`, `/request-a-transfer`; never `/book`, `/booking/*`, `/thank-you/*`. Check every page has a unique title, description and canonical (add a build-time test that crawls the built HTML in `dist/`).
4. Webhooks: the Sanity publish webhook filter becomes `_type in ["page","route","vehicleClass","form","siteSettings","uiStrings"]` (never `formSubmission`); update it in sanity.io/manage and in `docs/ARCHITECTURE.md` if anything differs.
5. Vercel: add `SANITY_WRITE_TOKEN`, `PUBLIC_STUDIO_URL` (tem-web) and `TEM_WEB_DEPLOY_HOOK_URL` (tem-admin) for Production and Preview; confirm the two crons (`reminders`, `form-retention`) are registered.
6. Launch guard `scripts/check-live-demo.mjs` (kit 1, prompt 13): also fail when a published `route` or `form` has `internalNote` matching DEMO, when a `form.recipientEmail` or topic recipient ends with `@example.com`, or when `siteSettings.email` ends with `@example.com`.

Tests:
- Admin Vitest + Playwright: AC-31 saving a price shows the banner; the button calls the hook once (mocked) and is disabled afterwards; AC-32 a fixture route with an unknown zone appears in the banner.
- Build test: sitemap contents as listed; unique titles/descriptions/canonicals across `dist/**/*.html`.
- Launch guard dry run on the DEMO data fails and lists routes, forms and example.com recipients.

Check (run and report pass/fail):
- Tests pass; preview deployment: publishing a route in the Studio rebuilds the site; creating a submission does not.

Commit: `feat(launch): admin website update, route checks, sitemap, guard for kit 2`
