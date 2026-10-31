# Deploy checklist — prompt 13

Do **not** create or change cloud resources until the client confirms each step. Never paste secrets into chat, issues or commits.

## In-repo (already wired)

| Item | Where |
| --- | --- |
| Cron: reminders every 15 min | `apps/web/vercel.json` → `/api/cron/reminders` |
| Cron: stuck paid-pending digest daily 06:00 UTC | `apps/web/vercel.json` → `/api/cron/stuck-payments` |
| Security headers + CSP | `apps/web/vercel.json` |
| Launch guard AC-21 | `pnpm check:live` / `pnpm check:live:dry`; runs automatically when `VERCEL_ENV=production` before `astro build` |
| Booking closed flag | `PUBLIC_BOOKING_OPEN=false` hides header “Book now”, closes `/book` UI, `/api/holds` → 503 |
| Weekly encrypted backups | `.github/workflows/backup.yml` |
| Restore drill | `packages/db/README.md` |

## Cloud steps (ask before running)

1. **Vercel** — projects `tem-web` (`apps/web`) and `tem-admin` (`apps/admin`), Node 22, pnpm, GitHub repo. Env vars per `ARCHITECTURE.md` §6 for Production vs Preview (Preview → development Supabase, Viva demo, Turnstile test keys). Domains: site + `admin.<domain>`. Set `CRON_SECRET`. Enable log alerts for 5xx on `/api/*`.
2. **Supabase production** — enable `pg_cron`, `supabase db push`, **no DEMO seed**, staff users, Auth site URL = admin URL, disable public sign-ups.
3. **Viva** — webhook `https://<domain>/api/webhooks/viva` (GET verification), events Payment Created + Failed; success/failure URLs on production. Until live approval (Fri 15 Jan 2027): demo credentials + `PUBLIC_BOOKING_OPEN=false`.
4. **Sanity** — publish webhook → `tem-web` deploy hook (types `page`, `siteSettings`, `uiStrings`, `vehicleClass`); CORS for site + admin.
5. **GitHub** — secrets for the backup workflow (see comments in `backup.yml`); run workflow once manually after secrets exist.
6. **Resend** — verified from-domain for reminder + stuck-payment digests.

## Preview vs production

- Preview: DEMO content OK; full demo booking; Viva demo webhook to the preview URL.
- Production: launch guard must pass; real ops data; booking open only when live Viva is ready.
