# Elite Protection — Sanity Studio manual for editors

**Audience:** people who update website wording, photos, pages, routes, vehicle class stories, form settings, and form enquiries.  
**Tool:** Sanity Studio (content management).  
**Language of the live site:** English only.  
**Company name in content:** Elite Protection (never NEVMA).

This guide is written for non-technical editors. Follow the numbered steps. When something is unsafe to do alone, it says **Ask the office / developer**.

---

## 1. Quick map: what you edit where

| You want to change… | Use | Live link |
| --- | --- | --- |
| Company name, phone, email, logo, opening hours, SEO defaults | **Sanity → Site settings** | [Studio](https://elite-protection.sanity.studio) |
| Button labels, booking form labels, error messages, email subject lines | **Sanity → UI strings** | same |
| Home / About / Contact / Fleet / Services / VIP / legal page text | **Sanity → Pages** | same |
| “Airport → centre” marketing route pages | **Sanity → Routes** | same |
| Vehicle names, photos, descriptions on `/fleet` | **Sanity → Vehicle classes** | same |
| Form titles, thank-you text, who receives enquiry emails | **Sanity → Forms and submissions → Form settings** | same |
| Customer enquiries from the website forms | **Sanity → Forms and submissions** | same |
| Prices, zones, vehicles, bookings, drivers | **Booking admin** (not Sanity) | [Admin](https://elite-transfer-admin.vercel.app) |
| See the public website | Browser | [Website](https://elite-tranfer-website-two.vercel.app) |

**Rule of thumb**

- **Sanity** = words, photos, SEO, form inbox.  
- **Admin** = money, availability, fleet capacity, bookings, drivers.  
- A vehicle class needs **both**: admin (capacity + prices + online) **and** Sanity (photos + public name).

Technical background (optional): [Content model](../CONTENT-MODEL.md), [Forms](../FORMS.md), [Pages](../PAGES.md).

---

## 2. How to open the Studio

1. Open **[https://elite-protection.sanity.studio](https://elite-protection.sanity.studio)**.
2. Sign in with the Google / email account your office invited you with (Sanity project membership).
3. Confirm you are on dataset **production** (shown in the Studio header / project switcher).
4. You should see the left menu titled **Elite Protection**.

If you cannot sign in: ask the project owner to invite you in [Sanity Manage](https://www.sanity.io/manage) for project `3d6h3ndb`.

Official help (Sanity):

- [Introduction to Sanity Studio](https://www.sanity.io/docs/studio)
- [Publishing and drafts](https://www.sanity.io/docs/drafts)
- [Working with images](https://www.sanity.io/docs/image-type)

---

## 3. Desk structure (left menu)

Exactly what you see in Studio:

1. **Site settings** — one document for the whole company  
2. **UI strings** — one document with every button / label / message  
3. **Booking widget** — short texts for the expanding search panel  
4. **Pages** — home, legal, About, Contact, Fleet, Services, VIP, Request a transfer, …  
5. **Routes** — one document per marketed route URL  
6. **Vehicle classes** — public fleet copy and photos  
7. **Forms and submissions**  
   - **Form settings** (the three forms)  
   - **Request a transfer** → New / In progress / Done / All  
   - **VIP security enquiries** → same folders  
   - **Contact** → same folders  

Singletons (Site settings, UI strings, Booking widget) cannot be created twice. Form submissions cannot be created by hand — the website creates them when someone submits a form.

---

## 4. Draft, Publish, Discard, Delete (must read)

Sanity keeps a **draft** (your unpublished edits) and a **published** version (what the website can use after rebuild / fetch).

| Action | What it does | When to use |
| --- | --- | --- |
| **Publish** | Makes your draft the live published document | After you finish editing and checked spelling |
| **Discard changes** | Throws away the draft; published version stays | You opened a document by mistake or want to undo unpublished edits |
| **Unpublish** | Removes the document from the published set | Rare — can hide a page from builds; **ask first** |
| **Delete** | Removes the document | Only for unused drafts, wrong routes, or privacy requests on submissions |

**Always Publish** after editing. A saved draft that is not published will **not** appear on the website.

**After publishing marketing pages / fleet / routes / site settings that affect “From” prices**, ask ops to press **Update the website** in the [admin](https://elite-transfer-admin.vercel.app) (or wait for the next deploy). Live booking prices always come from the admin/database; marketing pages are often built at deploy time.

---

## 5. Images (every image needs alt text)

1. Click the image field → **Upload** or drag a file.
2. Prefer wide, sharp photos (fleet cars, locations). Avoid text baked into the image when possible.
3. Fill **Alt text** (required): a short plain description for accessibility and SEO, e.g. `Black Mercedes V-Class parked at dusk`.
4. Do not upload logos or colours that look like NEVMA branding.
5. Remove DEMO watermarked images when real client photos arrive; clear any **Internal note** that still says DEMO.

---

## 6. Site settings — company identity

Open **Site settings**.

| Field | Effect on the site |
| --- | --- |
| Company name | Header / footer / emails identity |
| Tagline | Supporting line where used |
| Phone / Mobile phone | Click-to-call, contact page, footer |
| Public email | Contact and footer |
| Booking notification email | **Office inbox** for new bookings / cancellations (not shown as the public contact if different) |
| Address / Opening hours | Footer and Contact |
| Time zone | Read-only: `Europe/Athens` |
| Show “From” prices | On = show lowest prices on fleet/route pages; Off = “Price on request” on those pages (booking flow still shows live prices) |
| Default SEO | Fallback title / description / share image |
| Logo | Header mark; add alt text |
| WhatsApp block | Only appears if the website feature is switched on by developers; number itself is configured on the server |

**Publish** when done. Spot-check [the website footer](https://elite-tranfer-website-two.vercel.app).

---

## 7. UI strings — every small label

Open **UI strings**.

- Each row has **Area** (`booking`, `errors`, `emails`, `site`, `forms`), a **Key**, and a **Value**.
- Keys are fixed by the product. **Do not invent new keys** and do not delete required keys.
- Change only the **Value** text (English).
- Placeholders like `{reference}`, `{price}`, `{minutes}` must stay in the sentence — the system fills them in.

Full key list with defaults: [Content model — UI string keys](../CONTENT-MODEL.md#ui-string-keys-153).

Examples of safe edits:

- `nav.book` → “Book now”  
- `booking.pay` → “Pay securely”  
- `error.unavailable` → clearer wording for “no car free”

Examples of unsafe edits:

- Removing `{reference}` from an email subject  
- Changing a key name  
- Translating to another language (site is English only)

---

## 8. Booking widget

Open **Booking widget**.

| Field | Meaning |
| --- | --- |
| Empty panel message | Text when the search panel is open but empty |
| Popular routes heading | Title above popular routes |
| Max popular routes | How many popular routes to show (1–20) |

Popular routes themselves are configured in the **admin** (zones / featured routes), not here.

---

## 9. Pages — website pages

Open **Pages**. Each page has:

| Field | Guidance |
| --- | --- |
| Kind | `home`, `legal`, `standard`, or `template` |
| Title | Human title |
| URL slug | Must match the real URL path (see table below) |
| Sections | Content blocks in order (hero, rich text, FAQ, forms, …) |
| SEO | Optional title / description / image for this page |
| Internal note | Staff only — never shown publicly. Clear DEMO notes when real copy is in |

### Fixed slugs you should keep

| Slug | Public URL |
| --- | --- |
| `home` | [/](https://elite-tranfer-website-two.vercel.app/) |
| `fleet` | [/fleet](https://elite-tranfer-website-two.vercel.app/fleet) |
| `services` | [/services](https://elite-tranfer-website-two.vercel.app/services) |
| `vip-security` | [/vip-security](https://elite-tranfer-website-two.vercel.app/vip-security) |
| `about` | [/about](https://elite-tranfer-website-two.vercel.app/about) |
| `contact` | [/contact](https://elite-tranfer-website-two.vercel.app/contact) |
| `request-a-transfer` | [/request-a-transfer](https://elite-tranfer-website-two.vercel.app/request-a-transfer) |
| `privacy` | [/privacy](https://elite-tranfer-website-two.vercel.app/privacy) |
| `cookies` | [/cookies](https://elite-tranfer-website-two.vercel.app/cookies) |
| `terms` | [/terms](https://elite-tranfer-website-two.vercel.app/terms) |
| `cancellation` | [/cancellation](https://elite-tranfer-website-two.vercel.app/cancellation) |

**Do not rename these slugs** unless a developer is coordinating redirects.

### How to edit a page (step by step)

1. Pages → open the page (e.g. About).  
2. Edit title / SEO if needed.  
3. In **Sections**, expand a block (Hero, Rich text, FAQ, Form block, …).  
4. Change headings, body text, images, CTAs.  
5. For CTAs: prefer target **Book** (goes to booking) unless you truly need a custom URL.  
6. **Publish**.  
7. Open the matching public URL and hard-refresh (Ctrl+F5). If the change is missing, ask ops to **Update the website**.

### Section types you will see

Common blocks (details also in [DESIGN-V2-BLOCKS](../DESIGN-V2-BLOCKS.md)):

- **Hero** — main heading, optional image, optional button  
- **Rich text** — long copy  
- **CTA band** — mid-page call to action  
- **FAQ** — question / answer list  
- **Feature grid / Image + text / Steps** — marketing layouts  
- **Vehicle class list / Route list** — auto lists from other documents  
- **Contact details** — pulls phone/email/hours from Site settings  
- **Form block** — embeds one of the three forms  

---

## 10. Vehicle classes (website side of the fleet)

Open **Vehicle classes**.

This is **not** where you set passenger capacity or euro prices. Those live in [Admin → Fleet](https://elite-transfer-admin.vercel.app/fleet).

| Field | Guidance |
| --- | --- |
| Key | Must match the admin class key exactly (`v-class`, `vito`, …). **Locked after first publish** |
| Name / Full name / Type | Public labels |
| Group | Fleet filter: saloon / van / SUV / other |
| On board | Short amenity chips (Wi‑Fi, water, …), max 10 |
| Photos | 1–12 images, each with alt text |
| Description | Longer story |
| Specifications | Label / value pairs (e.g. Seats → 6) |
| Sort order | Lower numbers appear first |
| SEO | Optional |

### Correct workflow when ops add a new class

1. Ops creates the class in Admin (starts **offline**).  
2. You create / finish the Sanity vehicle class with the **same key** and at least one photo.  
3. Ops prices it and switches it **online**.  
4. Ops presses **Update the website**.  
5. Check [/fleet](https://elite-tranfer-website-two.vercel.app/fleet) and [/fleet/your-key](https://elite-tranfer-website-two.vercel.app/fleet).

Admin checklist for “Ready for customers?”: [Fleet setup](../FLEET-SETUP.md).

---

## 11. Routes (marketing route pages)

Open **Routes**. Each route becomes `/routes/[slug]`.

| Field | Guidance |
| --- | --- |
| Title | e.g. “Athens Airport to Athens centre” |
| Slug | URL piece, e.g. `airport-to-centre` |
| From zone code / To zone code | **Must match Admin zone codes exactly** and be different |
| Intro / Text / Photo / FAQ | Marketing content |
| Featured | Show in default route lists |
| Sort order | Ordering in lists |

**Critical:** if the zone pair does not exist in the admin database, the website **skips** that route at build time and the admin shows a warning. Always confirm zone codes with ops ([Admin → Zones](https://elite-transfer-admin.vercel.app/zones)).

After publish → **Update the website** → open `https://elite-tranfer-website-two.vercel.app/routes/your-slug`.

---

## 12. Forms — settings (not the inbox)

Open **Forms and submissions → Form settings**. There are three forms:

| Form key | Website page |
| --- | --- |
| `transfer-request` | [/request-a-transfer](https://elite-tranfer-website-two.vercel.app/request-a-transfer) |
| `vip-security` | [/vip-security](https://elite-tranfer-website-two.vercel.app/vip-security) (enquiry section) |
| `contact` | [/contact](https://elite-tranfer-website-two.vercel.app/contact) |

Editable settings (typical):

- Title, intro  
- Recipient email (who gets the office mail)  
- Contact form **topics** (label + optional per-topic recipient)  
- Submit button label  
- Success title / success message (thank-you page)  
- Retention months (how long submissions are kept before automatic deletion; default 24)

Field layouts themselves are fixed in code — you change **labels** via UI strings (`forms` area), not by adding new fields in Studio. See [Forms](../FORMS.md).

---

## 13. Form submissions — daily enquiry inbox

Path: **Forms and submissions →** choose the form → **New** / **In progress** / **Done**.

### What you can edit

- **Status:** `new` → `in-progress` → `done`  
- **Internal note:** private office notes  

### What is read-only

Name, email, phone, answers, submitted time, consent, email send status. These come from the customer; do not expect to “fix” them in Studio.

### Daily process

1. Open **New** for each form every morning.  
2. Open a submission → read answers → call / email the customer.  
3. Set status to **In progress**, add an internal note.  
4. When finished, set **Done**.  
5. For a deletion request (GDPR / privacy), use **Delete** on that submission after the office confirms.

You cannot create submissions manually. Test forms on the live thank-you flow instead.

Email templates for form notifications are UI strings under the `emails` / `forms` areas.

---

## 14. Create, edit, delete — cheat sheet

| Task | Steps |
| --- | --- |
| Edit existing page | Pages → open → edit → **Publish** |
| Create new standard page | Pages → Create → set kind/slug carefully → add sections → **Publish** → ask developer if the Astro route does not exist yet |
| Create route page | Routes → Create → set zone codes from admin → **Publish** → Update website |
| Create vehicle class story | Vehicle classes → Create → key = admin key → photos → **Publish** |
| Delete unused unused draft route | Open → Delete (only if never needed / never linked) |
| Delete a form submission | Open submission → Delete (privacy / retention) |
| Never delete | Site settings, UI strings, Booking widget, the three form settings, core legal pages — **edit instead** |

---

## 15. DEMO content and go-live hygiene

Seed content may include the word **DEMO** in internal notes or placeholder copy.

Before calling the site “live”:

1. Search documents for `DEMO` in Internal note and visible text.  
2. Replace with real Elite Protection copy and photos.  
3. Ask ops to run the placeholder check / clear DEMO settings in admin.  
4. Confirm phone, email, address, and booking notification email in Site settings.

---

## 16. What Sanity editors must never do

1. Put prices, zone lists, or “this car is free on Tuesday” into Sanity as if they were the booking system — **admin owns that**.  
2. Change a vehicle class **key** after it is in use.  
3. Invent zone codes that do not exist in admin.  
4. Commit or paste API tokens, passwords, or customer card data into any field.  
5. Add NEVMA names, logos, or colours.  
6. Publish testimonials / ratings the client did not supply.  
7. Switch the Studio to another dataset by accident.

---

## 17. After you publish — verification checklist

- [ ] Document status shows **Published** (no pending draft badge).  
- [ ] Open the matching public URL.  
- [ ] Hard refresh; if stale, ask for **Update the website** in admin.  
- [ ] For fleet: class appears on [/fleet](https://elite-tranfer-website-two.vercel.app/fleet) with your photo.  
- [ ] For routes: page loads; if missing, zone codes are wrong or rebuild pending.  
- [ ] For forms: submit a test, see it under **New**, and confirm the office email arrived.

---

## 18. Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Edits invisible on the website | Not published, or marketing page needs rebuild | Publish; then Admin → **Update the website** |
| “No Sanity page” in admin fleet | Missing vehicleClass with matching key | Create / publish vehicle class with that key |
| Route missing on site | Zone codes not in Postgres, or not rebuilt | Fix codes with ops; rebuild |
| Cannot create Site settings again | Singleton by design | Open the existing one |
| Cannot create a form submission | Created only by the website | Use the public form |
| Validation error on image | Missing alt text | Add alt |
| Validation error on vehicle key | Wrong format or already created | Use `lower-case-with-hyphens`, match admin |

---

## 19. Link directory

| Resource | URL |
| --- | --- |
| Sanity Studio | https://elite-protection.sanity.studio |
| Public website | https://elite-tranfer-website-two.vercel.app |
| Booking admin | https://elite-transfer-admin.vercel.app |
| Sanity Manage (owners) | https://www.sanity.io/manage |
| Sanity docs — Studio | https://www.sanity.io/docs/studio |
| Sanity docs — drafts / publish | https://www.sanity.io/docs/drafts |
| Sanity docs — images | https://www.sanity.io/docs/image-type |
| This project — content model | [CONTENT-MODEL.md](../CONTENT-MODEL.md) |
| This project — forms | [FORMS.md](../FORMS.md) |
| This project — pages map | [PAGES.md](../PAGES.md) |
| This project — fleet pairing with admin | [FLEET-SETUP.md](../FLEET-SETUP.md) |
| Companion admin manual | [ADMIN-OPERATORS-MANUAL.md](./ADMIN-OPERATORS-MANUAL.md) |
