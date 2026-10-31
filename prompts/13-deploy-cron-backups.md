# 13 — Deploy, webhooks, cron, backups, launch guard

Needs: 01–12; Vercel Pro team; production Supabase project (separate from development); domains. Produces: production and preview deployments, all integrations wired, backups, and the launch guard (AC-21). ~1 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/ARCHITECTURE.md` (§1, §6, §7, §9) and `.env.example` first. Ask me before any command that creates or changes cloud resources, and never print secret values.

1. Vercel: two projects in the client's team, `tem-web` (root `apps/web`) and `tem-admin` (root `apps/admin`), both from the GitHub repo, Node 22, pnpm. Environment variables per `docs/ARCHITECTURE.md` §6 for Production and Preview (Preview uses the **development** Supabase project, the Viva **demo** account and Turnstile test keys). Domains: site on the main domain, admin on `admin.<domain>`.
2. Cron: confirm `apps/web/vercel.json` registers `/api/cron/reminders` every 15 minutes and `CRON_SECRET` is set.
3. Supabase production: `supabase db push` (enable `pg_cron` first); **no DEMO seed**; real zones, prices, hourly rates, extras, fleet entered through the admin or a reviewed SQL import supplied by the client. Add staff users. Auth settings: site URL = admin URL, disable public sign-ups.
4. Viva: production webhook URL `https://<domain>/api/webhooks/viva` (verify it with the GET check), events Transaction Payment Created and Transaction Failed; the live payment source success and failure URLs on the production domain. Until the live account is approved (due Fri 15 Jan 2027) production stays on demo credentials and the site shows booking only to staff (feature flag `PUBLIC_BOOKING_OPEN=false` hides "Book now" and returns 503 from `/api/holds`).
5. Sanity: webhook on publish → `tem-web` deploy hook (filter as in prompt 12); CORS origins for the production site and admin.
6. Backups (`.github/workflows/backup.yml`, weekly Sunday 02:00 UTC): `sanity dataset export production` and `pg_dump` of the production database (custom format), compressed, encrypted with `age` to a public key whose private key the client holds, uploaded to the agreed storage; keep 8 weekly and 12 monthly; a failure opens a GitHub issue. Document a restore test in `packages/db/README.md` and run it once against a scratch project.
7. Launch guard `scripts/check-live-demo.mjs` (AC-21) run in the `tem-web` production build (`pnpm check:live` before `astro build` when `VERCEL_ENV=production`): fails if `pnpm check:placeholders` fails, if any published Sanity document has `internalNote` matching `DEMO` (GROQ `count(*[internalNote match "DEMO*"])`), if any `zones.name`, `vehicle_classes.name`, `extras.name` or `vehicles.label` starts with `DEMO`, or if any `settings.is_demo` is true. Print what remains; never print secrets.
8. Monitoring: Vercel log drains or alerts for 5xx on `/api/*`; a daily summary email to the office of bookings stuck in `pending` with `payment_status = paid` (should be none).

Check (run and report pass/fail):
- Preview deployment of a pull request: full demo booking works end to end, webhook reaches the preview.
- Production deployment builds only when the launch guard passes (show the guard failing on DEMO data in a dry run).
- Reminder cron visible in Vercel; a test call without the secret returns 401.
- Backup workflow ran once; restore test documented and done.

Commit: `chore(deploy): vercel projects, webhooks, cron, backups, launch guard`
