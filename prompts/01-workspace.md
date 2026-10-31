# 01 — Workspace: monorepo, web and admin apps, tooling, CI

Needs: the kit unzipped into the project folder; a GitHub repository. Produces: `apps/web` and `apps/admin` (empty Astro apps that build), shared tooling, CI. ~0.5 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/ARCHITECTURE.md` (sections 1, 2, 6) and `.env.example` first. `apps/studio` and `packages/db` already exist and are validated: do not change them in this prompt.

1. Check Node 22 (`.nvmrc`) and pnpm 10 (`packageManager` in the root `package.json`). Run `pnpm install` at the root.
2. Create `apps/web` as an Astro 7 project (package name `@tem/web`), TypeScript strict, no template content:
   - integrations: `@astrojs/react`, adapter `@astrojs/vercel`; `output: 'static'` with on-demand routes opted in per page (`export const prerender = false`);
   - dev server port 4321; `site` from `PUBLIC_SITE_URL`;
   - folders exactly as in `docs/ARCHITECTURE.md` §2: `src/pages/api/`, `src/components/booking/`, `src/lib/booking/`, `src/lib/server/`, `src/lib/sanity/`, `src/styles/`, `src/sanity/`;
   - `src/lib/env.ts`: reads and validates every variable `apps/web` uses (table in `docs/ARCHITECTURE.md` §6) with `zod`; server variables are only importable from server code (throw if imported in the browser bundle);
   - dependencies: `zod`, `@sanity/client`, `groq`, `@supabase/supabase-js`, `resend`, `@js-temporal/polyfill`; dev: `vitest`, `@playwright/test`, `@axe-core/playwright`, `@astrojs/check`, `typescript`.
3. Create `apps/admin` as a second Astro 7 project (`@tem/admin`): `output: 'server'`, adapter `@astrojs/vercel`, `@astrojs/react`, port 4322, `<meta name="robots" content="noindex">` in its base layout and an `X-Robots-Tag: noindex` header from middleware. Dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `zod`; same dev tools. `src/lib/env.ts` as in web, with only the admin's variables.
4. Root tooling: `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), each app extends it; ESLint flat config with `typescript-eslint` and `eslint-plugin-astro`; Prettier. Root scripts (keep the existing ones): `dev`, `build`, `lint`, `typecheck`, `test`, `check:placeholders`. Each app gets `dev`, `build`, `lint`, `typecheck` (`astro check`), `test` (`vitest run`).
5. Add a tiny smoke test per app (for example `src/lib/env.test.ts` that the schema rejects a missing required variable).
6. GitHub Actions `.github/workflows/ci.yml` on pull requests and `main`: Node 22, pnpm cache, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`. Add a job `db` that starts `postgres:16` as a service and runs `pnpm --filter @tem/db test` with `DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres`.
7. Create `apps/web/.env`, `apps/admin/.env` and `apps/studio/.env` from `.env.example` with empty values (they are git-ignored). Do not invent values.

Check (run and report pass/fail):
- `pnpm install` then `pnpm build`: web, admin and studio build.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass (the Studio's 14 tests included).
- `pnpm dev` serves web on :4321, admin on :4322, studio on :3333.
- `pnpm check:placeholders` runs and lists only `seed/sanity/data.ndjson` and `packages/db/seed/demo.sql`.
- No `.env` file is tracked by git.

Commit: `chore: monorepo with web and admin apps, tooling and CI`
