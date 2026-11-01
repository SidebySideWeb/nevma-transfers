# 24 — QA for kit 2

Needs: 15–23. Produces: `docs/QA-REPORT.md` extended with AC-25 to AC-34, fixes for what fails. ~1 day.

--- PROMPT ---

Read `AGENTS.md` and `docs/ACCEPTANCE.md` (kit 2 section) first. Add one row per AC-25 to AC-34 to `docs/QA-REPORT.md` (pass / fail, how it was proven, date, notes) and re-run the kit 1 rows that kit 2 touched (AC-01, AC-16, AC-19, AC-20, AC-21, AC-24). Fix failures in small commits and re-run.

1. Automated: `pnpm lint`, `pnpm typecheck`, `pnpm test` (web, admin, studio, db), Playwright for every kit 2 route at 390 and 1440 px with axe, forms with JavaScript on and off.
2. Lighthouse CI (mobile, 3 runs) on `/fleet`, one route page, `/vip-security`, `/contact`: LCP < 2.5 s, CLS < 0.1; report the medians.
3. Privacy and security (AC-29): grep the built client output of web and admin for the read token, the write token, the service role key and the deploy hook URL (use the values from the environment; do not print them) — all absent; a request with the read token trying to create a document gets 403.
4. Real form run on the preview deployment, recorded in the report: one submission per form with real inboxes; each shows in the Studio under the right form with status New; the office email links to it; set one to Done.
5. Content check with the client's material when available (O14–O17 in `docs/DECISIONS.md`): replace DEMO pages, routes, forms recipients and retention; the launch guard passes.
6. Price change run (AC-31): change one DEMO price in the admin, press "update the website", confirm the route page shows the new "From" price after the build.

Check (run and report pass/fail):
- `docs/QA-REPORT.md` lists AC-25 to AC-34, all pass (or accepted by the client in writing with a date); kit 1 rows re-run still pass.

Commit: `test(qa): kit 2 acceptance run`
