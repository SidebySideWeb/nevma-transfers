# 00 — How to run this kit in Cursor

## Before you start

1. Unzip the kit and move **everything** inside `tem-platform/` into your empty project folder, hidden files included (`.cursor/`, `.gitignore`, `.nvmrc`, `.env.example`). Open that folder in Cursor.
2. Check Cursor Settings → Rules: the files in `.cursor/rules/` are picked up; `00-project` shows as "Always".
3. Use a strong model in Agent mode. Keep auto-run **off** for commands that touch Sanity, Supabase, Vercel, Viva or git remotes; allow it for `pnpm` build and test commands.
4. Have these ready (the prompts ask for them when needed; never paste secrets into chat, put them in `.env` files yourself):

| Account | Needed from prompt |
| --- | --- |
| GitHub repository | 01 |
| Sanity project "Elite Protection" (dataset `production`, private) + an Editor token for the seed import | 02 |
| Supabase project (Pro, EU Frankfurt) + Supabase CLI logged in | 04 |
| Cloudflare Turnstile site (test keys first) | 06 |
| Viva demo account: Smart Checkout client id/secret, a payment source with success URL `/booking/confirmed` and failure URL `/booking/not-completed`, merchant id + API key (due Fri 27 Nov) | 07 |
| Resend API key + verified sending domain | 08 |
| Vercel Pro team (two projects: `tem-web`, `tem-admin`) | 13 |
| Viva live account (due Fri 15 Jan 2027) | 14 |

## The sequence

| # | Prompt | Result | ~Time |
| --- | --- | --- | --- |
| 01 | `01-workspace.md` | `apps/web` + `apps/admin` created, tooling, CI | 0.5 d |
| 02 | `02-sanity-studio-seed.md` | Studio running and deployed, DEMO content imported, types | 0.5 d |
| 03 | `03-design-foundation.md` | Tokens, fonts, base CSS, layout, header, footer, 404/500 | 1 d |
| 04 | `04-database.md` | Supabase migrations applied, DEMO seed, DB tests green, generated types | 0.5 d |
| 05 | `05-pricing-availability.md` | Pure booking functions with tests (price, time zone, ranges, limits) | 1 d |
| 06 | `06-holds-booking-api.md` | `/api/booking-options`, quote, holds, bookings, cancel, status; Turnstile, rate limits | 2 d |
| 07 | `07-viva.md` | Viva orders, webhook, late payment, refunds, internal routes | 2 d |
| 08 | `08-emails.md` | Confirmation, office notice, reminder cron, cancellation, late refund | 1 d |
| 09 | `09-booking-ui.md` | The `/book` island, four steps | 2.5 d |
| 10 | `10-return-pages.md` | Hand-off, confirmed, not completed, cancel pages | 0.5 d |
| 11 | `11-admin-app.md` | Standalone admin | 3 d |
| 12 | `12-shell-legal-seo.md` | Home, legal pages, SEO, headers, sitemap | 1 d |
| 13 | `13-deploy-cron-backups.md` | Vercel, webhooks, cron, backups, launch guard | 1 d |
| 14 | `14-qa.md` | E2E, axe, Lighthouse, security checks, real payment and refund | 1.5 d |

Prompts 02 and 04 can run in parallel after 01. 05 needs only 01. Payments (07) need Viva demo access (Fri 27 Nov); build 06, 08, 09 and 11 before that with Viva mocked.

## Kit 2 — content site and forms

Copy the kit 2 files over the repo first (see `README-KIT2.md`), then:

| # | Prompt | Result | ~Time |
| --- | --- | --- | --- |
| 15 | `15-studio-kit2-seed.md` | Studio extended and deployed, kit 2 DEMO content, write token, queries | 0.5 d |
| 16 | `16-catalog-data-layer.md` | Build-time catalog and "From" prices | 0.5 d |
| 17 | `17-sections-navigation.md` | Navigation, breadcrumbs, 7 new sections | 1 d |
| 18 | `18-fleet-pages.md` | Fleet overview and vehicle pages | 0.5 d |
| 19 | `19-services-routes.md` | Services, route pages, booking prefill | 1 d |
| 20 | `20-standard-pages.md` | VIP security, About, Contact | 0.5 d |
| 21 | `21-forms-backend.md` | Form API, Sanity submissions, emails, spam protection, retention | 1 d |
| 22 | `22-forms-ui.md` | Forms on the pages, prefill, thank-you pages | 1 d |
| 23 | `23-admin-seo-launch.md` | Admin "update the website", route checks, sitemap, webhooks, launch guard | 0.5 d |
| 24 | `24-qa-kit2.md` | Acceptance AC-25 to AC-34 | 1 d |
| 25 | `25-manage-booking.md` | Find my booking, manage booking, add to calendar (can run any time after kit 1) | 1 d |
| 26 | `26-admin-design.md` | Admin in the Elite Protection design (presentation only; after 11, and after 23 if kit 2 is applied) | 1.5 d |
| 27 | `27-vat-price-analysis.md` | Final prices, VAT price analysis on review and email (after 06–08, 10) | 0.5 d |
| 28 | `28-office-bookings-calendar.md` | Office bookings, fleet calendar, customers, brand dropdowns (after 11 and 26) | 4 d |
| 29 | `29-fleet-setup.md` | Add and edit classes, vehicles, zones, extras (after 11 and 26) | 1.5 d |
| 30 | `30-v2-design-foundation.md` | Website in the V2 design: fonts, components, kit 1 pages (after 15, before 16) | 3 d |

Extra accounts: a Sanity **Editor** robot token for form submissions (prompt 15); the tem-web Vercel deploy hook URL for the admin (prompt 23).

## How to paste a prompt

Open the prompt file and copy everything **below the line `--- PROMPT ---`** into a new Cursor Agent chat. When the agent finishes, run its **Check** list yourself (or ask "Run the Check list of this prompt and report each item as pass or fail"). Commit only when every item passes, with the commit message at the end of the prompt. One prompt per chat.

## When something goes wrong

- The agent wants to change the Sanity schema or an existing migration: reply "Do not change it. Adapt the query or code; if the database really needs a change, write a new numbered migration and update docs/DATA-MODEL.md and the tests."
- The agent invents design: reply "Match `design/screens/<file>.html` and use tokens only."
- The agent computes a price in the browser or trusts a redirect: reply "Read AGENTS.md golden rules 3 and 6 and fix it."
- A prompt is too big for one run: "Do steps 1–4 only, stop and report", then "Continue with step 5".
- After any fix round: "Re-run the Check list of this prompt and report each item as pass or fail."

## Follow-up prompt template (changes later)

```
Read AGENTS.md and docs/<relevant>.md first.
Change: <what, where, why>.
Keep: golden rules, existing tests green, tokens only, strings from uiStrings.
Tests first: <AC id or new test>.
Check: pnpm lint, pnpm typecheck, pnpm test, and <specific check>.
```
