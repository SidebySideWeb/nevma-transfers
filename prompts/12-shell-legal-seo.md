# 12 — Home, legal pages, SEO, security headers

Needs: 02, 03. Produces: the public pages from Sanity, SEO basics, structured data, headers. ~1 day.

--- PROMPT ---

Read `AGENTS.md`, `docs/PAGES.md`, `docs/CONTENT-MODEL.md` (page sections) and open `design/screens/home.html` first.

1. `src/components/sections/`: `Hero.astro`, `RichText.astro` (Portable Text via `astro-portabletext`; links with `rel="noopener"` for external; no `set:html` of editor content), `CtaBand.astro`, `Faq.astro` (native `<details>`), and `Sections.astro` that renders `page.sections` in order by `_type`. A `ctaTarget` of `book` links to `/book`.
2. `src/pages/index.astro` renders `page-home`; `src/pages/[legal].astro` with `getStaticPaths` for `privacy`, `cookies`, `terms`, `cancellation`. Missing page → build fails with a clear message.
3. Images from Sanity through `@sanity/image-url` with `width`, `auto=format`, `fit=max`, `srcset` (480, 768, 1200, 1600), explicit `width`/`height` to avoid layout shift; the hero image `fetchpriority="high"`, others lazy.
4. SEO: title template "<page> · TEM Protection"; description, canonical, Open Graph and Twitter tags from `seo` with `siteSettings.defaultSeo` fallback; `noindex` respected; `/sitemap.xml` (home and legal pages only), `/robots.txt` disallowing `/book`, `/booking/`, `/api/`. JSON-LD on home: `Organization` (name, url, logo, telephone, email, address from `siteSettings`) and `FAQPage` from the FAQ section.
5. Security headers for `apps/web` in `vercel.json`: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a `Content-Security-Policy` that allows self, Sanity's CDN for images, Cloudflare Turnstile (script and frame), and form/navigation to Viva's checkout hosts; `X-Frame-Options: DENY` on `/book` and `/booking/*`.
6. Rebuild on publish: a Sanity webhook (published documents of types `page`, `siteSettings`, `uiStrings`, `vehicleClass`) to the Vercel deploy hook of `tem-web` (set up in prompt 13; document it here in `docs/ARCHITECTURE.md` if anything differs).

Tests:
- Vitest: `Sections` renders each section type from a fixture; JSON-LD validates against the expected shape.
- Playwright: home and each legal page render with DEMO content; AC-19 axe clean; headers present on a preview build.
- AC-20: Lighthouse (mobile) on home ≥ 90 performance with LCP < 2.5 s and CLS < 0.1 (report the numbers).

Check (run and report pass/fail):
- Tests pass; sitemap and robots correct; CSP does not block Turnstile or the Viva redirect (check in the browser console on `/book`).

Commit: `feat(site): home, legal pages, SEO and security headers`
