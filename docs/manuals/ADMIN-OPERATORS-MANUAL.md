# Elite Protection — Booking admin manual for operators

**Audience:** office staff who manage bookings, fleet, vehicles, drivers, prices, calendar, customers, and (if enabled) corporate accounts.  
**Tool:** Booking admin web app.  
**Language:** English UI.  
**Money:** euro amounts you type; the system stores integer cents.  
**Times:** Europe/Athens unless a screen says otherwise.

This guide is for non-technical operators. Follow the steps. Red warnings in the app are database rules — do not try to bypass them.

---

## 1. Quick map: admin vs Sanity vs website

| Job | Where |
| --- | --- |
| Confirm / assign / cancel / refund bookings | **Admin** |
| Add office (phone) bookings | **Admin → Bookings → New** |
| Classes, vehicles, zones, extras, prices | **Admin** |
| Drivers, shifts, pay statements | **Admin** (when Drivers is on) |
| Website photos, About text, form inbox | **Sanity Studio** — see [SANITY-EDITORS-MANUAL.md](./SANITY-EDITORS-MANUAL.md) |
| Customer self-serve book & pay | **Public website** |

| App | Link |
| --- | --- |
| Booking admin | [https://elite-transfer-admin.vercel.app](https://elite-transfer-admin.vercel.app) |
| Public website | [https://elite-tranfer-website-two.vercel.app](https://elite-tranfer-website-two.vercel.app) |
| Sanity Studio | [https://elite-protection.sanity.studio](https://elite-protection.sanity.studio) |
| Book online | [https://elite-tranfer-website-two.vercel.app/book](https://elite-tranfer-website-two.vercel.app/book) |

Technical references: [Fleet setup](../FLEET-SETUP.md), [Office bookings](../OFFICE-BOOKINGS.md), [Drivers](../DRIVERS.md), [Pages / admin routes](../PAGES.md), [Booking rules](../BOOKING-RULES.md).

---

## 2. Sign in

1. Open [https://elite-transfer-admin.vercel.app/login](https://elite-transfer-admin.vercel.app/login).  
2. Sign in with your **staff** email and password (or magic link if your office uses it).  
3. Only emails on the staff allow-list can stay signed in. Driver logins and company booker logins are **not** staff — they are signed out of admin.  
4. Sign out via **Logout** when you leave a shared computer.

If login fails: ask the project owner to add your email to staff and resend credentials. Do not share one staff login across the whole office if you can avoid it (audit trail uses your user).

---

## 3. Sidebar map (what each menu does)

Menus can hide when a feature is switched off for your deployment. Typical full layout:

### Operations

| Menu | URL | Purpose |
| --- | --- | --- |
| Today | [/today](https://elite-transfer-admin.vercel.app/today) | Dispatch board for today (vehicles, drivers, gaps) |
| Bookings | [/bookings](https://elite-transfer-admin.vercel.app/bookings) | Search and open every booking |
| Fleet calendar | [/calendar](https://elite-transfer-admin.vercel.app/calendar) | Timeline of vehicles, holds, blocks |
| Customers | [/customers](https://elite-transfer-admin.vercel.app/customers) | Customer list and history |
| Companies | [/companies](https://elite-transfer-admin.vercel.app/companies) | Corporate accounts (if Corporate is on) |
| Blocked slots | [/blocked-slots](https://elite-transfer-admin.vercel.app/blocked-slots) | Take a vehicle offline for a time range |

### Drivers (if Drivers is on)

| Menu | URL | Purpose |
| --- | --- | --- |
| Drivers | [/drivers](https://elite-transfer-admin.vercel.app/drivers) | Driver list, invite, pay plans |
| Reports | [/reports](https://elite-transfer-admin.vercel.app/reports) | Pay / vehicle / booking reports + export |

### Pricing

Exact items depend on pricing mode (distance vs classic zones). Common entries:

| Menu | Purpose |
| --- | --- |
| Rates / Zone prices / Fixed routes | Core transfer pricing |
| Hourly | Hourly-hire rates and min/max hours |
| Extras | VIP security, night surcharge, other add-ons |
| Night & periods, Airports & ports, Waiting, Demand, Long distance, Simulator | Distance-pricing controls |
| Flights | Flight tracking buffers (if on) |
| Quote failures | Failed online quotes (diagnostics) |

### Setup

| Menu | URL | Purpose |
| --- | --- | --- |
| Fleet | [/fleet](https://elite-transfer-admin.vercel.app/fleet) | Classes + vehicles |
| Zones | [/zones](https://elite-transfer-admin.vercel.app/zones) | Service areas |
| Places & routes | [/places](https://elite-transfer-admin.vercel.app/places) | Saved places / popular routes (if Places is on) |
| Settings | [/settings](https://elite-transfer-admin.vercel.app/settings) | Hold minutes, lead time, feature toggles, etc. |

### Top banner: “Update the website”

After you change prices, fleet, zones, or extras, a banner may say prices changed. Click **Update the website** so marketing pages refresh “From” prices and fleet listings. There is a short cooldown between rebuilds. Details: kit 2 launch behaviour in [PAGES.md](../PAGES.md).

---

## 4. Booking statuses (learn this first)

| Status | Meaning | Typical next action |
| --- | --- | --- |
| **Pending** | Hold / awaiting card payment | Wait for Viva, or cancel if abandoned |
| **Confirmed** | Paid or office-confirmed | Assign vehicle (and driver if used) |
| **Assigned** | Chauffeur / vehicle confirmed for the customer timeline | Track trip; mark completed after |
| **Completed** | Journey done (or no-show completed) | — |
| **Cancelled** | Cancelled; refund may apply | — |
| **Expired** | Hold ended without payment | — |

**Important rules**

- A browser “thank you” page **never** confirms payment by itself. Only a verified Viva payment (or an office offline confirmation) does.  
- Customers never send the price — the server always recalculates.  
- Online cancel/refund limits follow [booking rules](../BOOKING-RULES.md) and Settings.

---

## 5. Bookings list

Open [/bookings](https://elite-transfer-admin.vercel.app/bookings).

1. Use filters: status, date range, type (transfer / hourly), VIP, invoice status.  
2. Columns include reference, pick-up, route/hours, class, vehicle, customer, total, payment, VIP, invoice.  
3. A badge count on **Bookings** can show how many need a vehicle.  
4. Click a **reference** to open the detail page.  
5. Use **New booking** for phone / email / walk-in jobs ([§7](#7-new-office-booking)).

---

## 6. Booking detail — day-to-day actions

Open `/bookings/EP-……` (example path: [/bookings](https://elite-transfer-admin.vercel.app/bookings) → click a row).

### What you will see

- Trip: type, class, zones or places, addresses, pick-up time, passengers, luggage, flight  
- Customer contact  
- Price lines, VAT, payment history  
- Vehicle and (if Drivers on) driver  
- Notes, security notes, invoice fields  
- Event history  

### Common actions

| Action | When | Notes |
| --- | --- | --- |
| **Assign / change vehicle** | Confirmed booking without a car, or wrong car | Only free vehicles of that class for the blocked time are listed |
| **Assign / change driver** | Drivers feature on | Only free active drivers; emails driver if invited |
| **Mark completed** | After the trip | Also happens when trip status reaches completed / no-show |
| **Save notes / invoice** | Office notes, invoice number / status | |
| **Record offline payment** | Office booking marked “collect later” | Cash / bank / on account |
| **Cancel** | Customer or office cancels | Uses signed internal cancel; may refund |
| **Refund** | Card payment needs money back | Shows refundable amount; Viva for card; offline refund for offline pay |
| **Trip status** | Drivers on | `scheduled → on_way → arrived → on_board → completed` (or `no_show`) |
| **Check flight / set delay** | Flight tracking on | Shifts pick-up when rules allow |

### Vehicle assignment tips

- Customers book a **class**, not a plate. You assign the physical vehicle.  
- If a class has **exactly one active vehicle**, the system can auto-assign on confirm (Settings → auto-assign). See [Fleet setup § Automatic vehicle](../FLEET-SETUP.md).  
- You cannot put a vehicle into **maintenance / retired** or change its class while it has future confirmed/assigned bookings — finish or reassign those first.

---

## 7. New office booking

Open [/bookings/new](https://elite-transfer-admin.vercel.app/bookings/new) (also reachable from the calendar empty slot).

### Step-by-step

1. **Customer** — search by name, email, or phone; or type a new customer.  
2. **Trip** — Transfer or Hourly; pick-up time (Athens); addresses (autocomplete if enabled).  
3. **Class** — see list price and how many vehicles are free.  
4. **Optional vehicle** — assign now if you already know the car.  
5. **Extras** — e.g. VIP security.  
6. **Payment** choose one:  
   - **Payment link** — emails the customer a Viva link; booking stays pending until paid.  
   - **Offline paid** — already paid cash/bank; booking confirmed.  
   - **Offline collect** — confirmed but unpaid; record payment later on the booking page.  
7. **Price override** (optional) — enter a different total **and a reason** (required).  
8. **Email customer** — usually leave on so they get confirmation / payment link.  
9. Submit → you get a **reference**. Open it from Bookings.

Full technical contract: [OFFICE-BOOKINGS.md](../OFFICE-BOOKINGS.md).

---

## 8. Fleet calendar

Open [/calendar](https://elite-transfer-admin.vercel.app/calendar).

- Default = **day** view (today, Athens). Switch to week via the view control / `?view=week`.  
- Rows = vehicles grouped by class; each class also has a **Needs a vehicle** lane.  
- Bars = bookings (and buffers), holds, blocks.  
- Click a booking bar → booking detail.  
- Click empty time on a vehicle → **New booking** or **Block**.  
- No drag-and-drop; change vehicle on the booking page.

Use this screen for “who is free at 18:00?” and for planning blocks (service, private use).

---

## 9. Blocked slots

Open [/blocked-slots](https://elite-transfer-admin.vercel.app/blocked-slots).

1. Choose vehicle, from/to time, reason.  
2. Save — that vehicle cannot take bookings overlapping the block.  
3. Delete only **future** blocks you no longer need.  
4. Prefer a short block over setting the whole vehicle to maintenance when you only need a few hours off.

---

## 10. Fleet — classes and vehicles

Open [/fleet](https://elite-transfer-admin.vercel.app/fleet).

### Classes table

- Key, internal name, max passengers, max luggage, buffer minutes, sort order, online/offline.  
- Flag **No Sanity page** if website content is missing.  
- Click the class name → [/fleet/[key]](https://elite-transfer-admin.vercel.app/fleet) class detail.

### Vehicles table

- Label (unique), class, model/colour/plate (staff), status: **active / maintenance / retired**.  
- Click label → Edit vehicle.

### Add a class (correct order)

1. **Add class** (starts **offline**).  
2. **Add vehicle(s)** in that class; leave at least one **active**.  
3. Set **prices** (Rates / Fixed routes / Hourly as applicable).  
4. Ask an editor to create the Sanity vehicle class with the **same key** + photos ([Sanity manual §10](./SANITY-EDITORS-MANUAL.md#10-vehicle-classes-website-side-of-the-fleet)).  
5. Open the class page → check **Ready for customers?**  
6. Switch the class **online**.  
7. Click **Update the website**.

### Class detail checklist (“Ready for customers?”)

Usually requires:

- [ ] ≥ 1 active vehicle  
- [ ] Prices or hourly rate present  
- [ ] Sanity page with ≥ 1 photo  
- [ ] Class set online  

Missing items show in red here and in the top admin banner.

### Rules you cannot break (database)

1. Keys / codes: lowercase letters, numbers, hyphens. Fixed once used.  
2. Used classes/vehicles/zones are switched **off / retired**, not deleted.  
3. Built-in extras `vip-security` and `night-surcharge` can be priced or disabled, never deleted/renamed.  
4. Switching a class offline hides it from **new** quotes only; old bookings remain.

Deep dive: [FLEET-SETUP.md](../FLEET-SETUP.md).

---

## 11. Zones, places, extras, pricing

### Zones — [/zones](https://elite-transfer-admin.vercel.app/zones)

- Add / rename / reorder / switch off.  
- Zone **codes** are what Sanity route documents must copy exactly.  
- Switching a zone off stops new bookings using it.

### Places & routes — [/places](https://elite-transfer-admin.vercel.app/places)

(If enabled.) Saved places and featured popular routes for the booking widget.

### Extras — [/extras](https://elite-transfer-admin.vercel.app/extras)

- Set euro price and active flag.  
- Customer-facing labels/hints for extras live in Sanity **UI strings** (`booking.extras.*`).

### Pricing screens

- Change rates carefully; they affect every new quote immediately.  
- After price edits, use **Update the website** so “From” prices on marketing pages catch up.  
- Use **Simulator** (if present) to dry-run a trip before arguing with a customer.  
- **Quote failures** shows why the website could not price a trip (too far, no route, etc.).

Never accept a price typed by a customer into a booking — always let the system price, or use an explicit office **override with reason**.

---

## 12. Customers

Open [/customers](https://elite-transfer-admin.vercel.app/customers).

- Auto-created from bookings (one row per email).  
- Search, sort, CSV export.  
- Open a customer → see bookings, edit name/phone/invoice/notes.  
- You cannot change the email or delete the customer here (privacy deletion is a separate process).  
- **New booking for this customer** pre-fills the office form.

---

## 13. Companies (corporate) — if enabled

Open [/companies](https://elite-transfer-admin.vercel.app/companies).

Typical tasks:

1. Create / edit company (VAT, billing, pay-on-account, credit limit, discount / price list).  
2. Invite **bookers** (they use the public `/business` area, not this admin).  
3. Maintain company fixed prices if used.  
4. Build / send / mark paid **statements**.  
5. Review company bookings and open balance.

Company bookers pay on account or by card through the website; you still dispatch the booking like any other once it is confirmed.

---

## 14. Drivers and dispatch — if enabled

Open [/drivers](https://elite-transfer-admin.vercel.app/drivers). Full design: [DRIVERS.md](../DRIVERS.md).

### Driver records

- Name, email (unique), phone, employee/freelancer, licence / permit dates, notes, active flag.  
- Switch off instead of deleting.  
- Warn early on expiring licence / permit.

### Invite to driver app

1. Open the driver.  
2. **Invite to the driver app**.  
3. They receive a login email.  
4. They are **not** staff and cannot use this admin.

### Assignment

- On the booking page, pick a free driver for the blocked time.  
- Overlaps are refused automatically.  
- Driver gets email on assign / late changes (if they have login).

### Shifts (start of day)

- Driver (or office) starts a shift on one **active** free vehicle.  
- One open shift per driver and per vehicle.  
- End of day closes the shift.  
- Office can correct shifts (source “office”).

### Trip status

Forward-only for drivers:  
`scheduled → on_way → arrived → on_board → completed`  
`no_show` from on_way or arrived.  
Office may set any status. Completed / no-show completes the booking.

### Today board — [/today](https://elite-transfer-admin.vercel.app/today)

- Refreshes about every 60 seconds.  
- Per vehicle: who is on shift, current job, next job.  
- Lists today’s bookings missing driver or vehicle.  
- Use this as the operations “wall screen”.

### Pay and statements

- Pay **plan** per driver with dated rates (salary, daily, hourly, %, fixed per transfer, …).  
- Adjustments: tip, waiting, expense, bonus, deduction, advance.  
- Statements: draft → recalculate → approve → mark paid (payment reference required).  
- Exports: CSV / Excel; printable statement pages under the driver.

### Reports — [/reports](https://elite-transfer-admin.vercel.app/reports)

- Driver pay, vehicles usage, bookings per day for a date range.  
- Export CSV / Excel for accounting.

---

## 15. Settings

Open [/settings](https://elite-transfer-admin.vercel.app/settings).

Examples of what lives here (labels vary):

- Hold length for online checkout  
- Office payment-link hold length  
- Minimum lead time before pick-up  
- Auto-assign single vehicle  
- Flight buffers / caps (if flight tracking on)  
- Other operational toggles  

Rows still marked **DEMO** must be replaced with real client values before go-live. Use clear-DEMO actions only when you intend to wipe demo configuration.

---

## 16. Payments, refunds, and money hygiene

| Situation | What to do |
| --- | --- |
| Online card pay | Customer pays on Viva; wait until status becomes Confirmed |
| Payment link (office) | Same — confirmation only after Viva verifies |
| Cash / bank already taken | New booking → Offline paid, or Record offline payment later |
| Refund card | Booking → Refund (amount limited to what was paid minus prior refunds) |
| Refund offline | Offline refund row — no Viva call |
| Argument about price | Re-quote in admin/simulator; use override + reason only when the office intentionally discounts |

Never type card numbers into notes. Never put secrets in Settings values.

---

## 17. Working with Sanity editors (handoffs)

| Ops does in Admin | Editor does in Sanity |
| --- | --- |
| Creates class `vito` | Creates vehicle class document key `vito` + photos |
| Creates zones `airport`, `centre` | Creates route with those exact codes |
| Changes VIP extra price | Updates `booking.extras.vip` label/hint if wording changes |
| Presses Update the website | Publishes pages first |

If the top banner says a Sanity route’s zones are missing, fix zones or ask the editor to fix codes.

---

## 18. Daily / weekly operating rhythms

### Morning

1. [/today](https://elite-transfer-admin.vercel.app/today) — gaps (no vehicle / no driver).  
2. [/bookings](https://elite-transfer-admin.vercel.app/bookings) — filter today + confirmed/assigned.  
3. Sanity form **New** folders (or ask the editor) for overnight enquiries.  
4. Check licence/permit warnings on Drivers.

### During the day

1. Assign vehicles/drivers as bookings confirm.  
2. Use calendar for clashes.  
3. Update trip statuses (or let drivers do it).  
4. Record offline payments promptly.

### End of day / week

1. Mark completed trips.  
2. Close open shifts.  
3. Build driver statements for the pay period.  
4. Export reports for accounts.

---

## 19. Create / edit / delete cheat sheet

| Item | Create | Edit | Delete / retire |
| --- | --- | --- | --- |
| Class | Fleet → Add class | Class page | Offline if used; delete only if never used |
| Vehicle | Fleet → Add vehicle | Edit dialog | Maintenance / retired; delete only if never used |
| Zone | Zones → Add | Zones | Switch off if used |
| Extra | Extras → Add | Extras | Not for vip-security / night-surcharge |
| Block | Blocked slots or calendar | — | Delete future block |
| Office booking | Bookings → New | Booking detail | Cancel (do not “delete”) |
| Driver | Drivers → Add | Driver page | Switch inactive |
| Company | Companies → Add | Company page | Deactivate users; follow office policy |

---

## 20. Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Cannot sign in | Not on staff list | Ask owner to allow-list email |
| Class not on website | Offline, no Sanity, or no rebuild | Finish checklist; Update website |
| “No vehicle available” online | Capacity / blocks / buffer clash | Calendar; free a car or change time |
| Cannot set vehicle maintenance | Future bookings on that car | Reassign or cancel those bookings |
| Payment stuck pending | Customer closed Viva | Resend / new pay attempt; or cancel hold |
| Refund button disabled | Nothing refundable / already refunded | Check payments list |
| Driver invite fails | Email exists as staff, or web signing misconfigured | Ask developer; check internal invite logs |
| Company booker cannot book on account | Pay-on-account off, credit exceeded, or quote issue | Company settings + credit; see corporate errors |
| “Update the website” disabled | Cooldown | Wait the seconds shown, retry |

---

## 21. Security and privacy (non-negotiable)

1. Only staff accounts in this admin.  
2. Do not screenshot customer documents into public channels.  
3. Do not export CSV/Excel to shared drives without a need.  
4. Driver app tokens and Viva secrets are never pasted into booking notes.  
5. For a customer “delete my data” request, involve the project owner — bookings are anonymised by process, not by casually deleting rows.

---

## 22. Link directory

| Resource | URL |
| --- | --- |
| Admin login | https://elite-transfer-admin.vercel.app/login |
| Today | https://elite-transfer-admin.vercel.app/today |
| Bookings | https://elite-transfer-admin.vercel.app/bookings |
| New booking | https://elite-transfer-admin.vercel.app/bookings/new |
| Calendar | https://elite-transfer-admin.vercel.app/calendar |
| Fleet | https://elite-transfer-admin.vercel.app/fleet |
| Drivers | https://elite-transfer-admin.vercel.app/drivers |
| Reports | https://elite-transfer-admin.vercel.app/reports |
| Settings | https://elite-transfer-admin.vercel.app/settings |
| Public book | https://elite-tranfer-website-two.vercel.app/book |
| Sanity Studio | https://elite-protection.sanity.studio |
| Fleet setup (detail) | [FLEET-SETUP.md](../FLEET-SETUP.md) |
| Office bookings (detail) | [OFFICE-BOOKINGS.md](../OFFICE-BOOKINGS.md) |
| Drivers (detail) | [DRIVERS.md](../DRIVERS.md) |
| Booking rules | [BOOKING-RULES.md](../BOOKING-RULES.md) |
| Sanity editors manual | [SANITY-EDITORS-MANUAL.md](./SANITY-EDITORS-MANUAL.md) |
