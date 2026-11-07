# Booking engine v2 ("like Blacklane"): gap analysis, feature switches and build plan

Written 7 Nov 2026 for the Elite Protection codebase. The same code also runs the friend's transfer company. One deployment per client: every new feature has an `.env` switch, as `FEATURE_DRIVERS` does. When a switch is off, the feature is invisible on the site and in the admin, its API routes return 404, and the existing behaviour stays exactly as it is now.

## 1. The 16 requests against what already exists

| # | Request | Today | What's missing | Switch |
|---|---|---|---|---|
| 1 | Live vehicle selection (photos, passengers, luggage) | Classes come from Sanity with photos and capacity; availability is counted per vehicle class | Step 2 "Choose your vehicle" lists every class with its price for this trip; full classes are greyed out with "Not available at this time" | core (always on) |
| 2 | Smart autocomplete | Done (0017, `@tem/places`) | Bias to Attica (see 3); airports, ports and hotels shown first | `FEATURE_PLACES` (exists as env keys, now a formal switch) |
| 3 | Point-to-point anywhere in Athens/Attica, nowhere else | Fixed list of zones | Any address. Suggestions are restricted to the Attica box; the server checks that both points lie inside the Attica service area (polygon) and refuses anything outside with "We only serve Athens and Attica. Contact us." | `FEATURE_DISTANCE_PRICING` + `SERVICE_AREA=attica` |
| 4 | Return transfer | No | "Add return" on step 1: return date/time with the same addresses swapped. One payment, two linked bookings, each with its own vehicle hold and assignment. Optional return discount % | `FEATURE_RETURN_TRIP` |
| 5 | Hourly chauffeur | Done (hourly rates, 4–12 h) | Blacklane style: "2 hours (80 km included)". Km included per hour and an extra-km rate per class; the drop-off is optional | core, extends existing hourly |
| 6 | Flight tracking | No (flight number is a plain text field) | Flight number + date are checked against a flight-data provider. A scheduled job follows arrivals; when a flight is delayed, the pick-up time moves (landing + buffer), the vehicle hold moves with it, and the office gets an alert | `FEATURE_FLIGHT_TRACKING` + provider key |
| 7 | Corporate booking (hotels, travel agencies, companies) | No | Company accounts with their own users, a negotiated price list or discount, "book for a guest", pay by card or on account with a monthly statement/invoice | `FEATURE_CORPORATE` |
| 8 | Google Maps distance and time | No (excluded from v1) | Google Routes API (server only): distance in km and duration with traffic for the chosen pick-up time; the result is stored on the quote and the booking | `FEATURE_DISTANCE_PRICING` |
| 9 | Dynamic pricing per route, time, vehicle and demand | Fixed zone prices + night surcharge + extras | Pricing rules engine (section 3): per class, per route, per time and per period, plus an optional demand factor with a cap | `FEATURE_DISTANCE_PRICING`, `FEATURE_DEMAND_PRICING` |
| 11 | Instant quote | Partly (zone price shown before payment) | One server call `POST /api/quote` returns prices for all classes in under 1 s | core |
| 12 | Fixed price | Partly | The quote is signed and valid for 20 min. The customer pays exactly that price; the server re-checks the signature and expiry, never a new calculation | core |
| 13 | Instant booking, online payment | Done (Viva hosted checkout, confirmation email) | Nothing, apart from the return-trip and corporate variants | — |
| 14 | Temporary hold, no double booking | Done (vehicle hold while paying, DB no-overlap constraint) | Holds now cover the driving duration from Routes + buffer, not a fixed slot; for return trips, both legs are held together | core |
| 15 | Back office pricing rules without a developer | Zone prices, hourly rates, extras, settings | A "Pricing" area: rates per class, minimum fare, extra stops, waiting, night, special periods, airport fees, return discount, demand, plus a quote simulator to test a trip before saving | `FEATURE_DISTANCE_PRICING` |
| 16 | WhatsApp as the main contact | Phone and email | WhatsApp is the first contact option on the site (header, contact page, floating button on phones). A "Message us on WhatsApp" button in every booking email and on Manage my booking, which opens a chat with the booking reference already typed | `FEATURE_WHATSAPP` |

(There is no request 10 in the client's list.)

### WhatsApp (request 16): how it works

- **Links:**
  - It uses free WhatsApp "click to chat" links, `https://wa.me/<number>?text=<message>`. You don't need the WhatsApp Business API, a Meta account or message templates.
  - The number is in international format with no + or spaces (`WHATSAPP_NUMBER=30694…`).
  - Build the link in one helper, `whatsappUrl(ref?, lang)`, in `@tem/features`. The message is URL-encoded and prefilled. With a booking it reads "Hello, about my booking EP-7K3QX (23 Nov, 18:34)"; without one it reads "Hello, I'd like information about a transfer".
- **Site:**
  - WhatsApp comes first in the header contact and on the contact page (above phone and email), and in the footer.
  - On phones, add a floating green button bottom-right that doesn't cover the booking widget's buttons.
  - Desktop opens WhatsApp Web, phones open the app.
  - The text, and whether the floating button shows, are edited in Sanity (Site settings → WhatsApp).
- **Manage my booking:** add a "Message us on WhatsApp" card at the top, using the booking reference. Keep it visible in every booking status, including cancelled.
- **Emails (`@tem/email`):**
  - Add a `whatsapp` block: a green VML-safe button plus a plain-text fallback line with the link.
  - Add it to every customer email: confirmation, payment link, reminder, chauffeur details, cancelled, refund, manage link, trip completed. The office emails don't get it.
  - `wa.me` is https, so the existing link check allows it.
- **Admin:** in Booking detail, the customer phone also gets a "WhatsApp" link (to the customer's number, using the booking reference), so the office can reply in one click.
- **Privacy:** the prefilled text contains only the reference and the date, never the name, address or price.

**Your main change is right:** distance and time pricing (8 + 9 + 15) is the core. It changes the quote, the hold and the admin. Return trips and flights build on it. Corporate is the biggest separate piece.

## 2. The switches

Add one module, `packages/features` (`@tem/features`), shared by `apps/web` and `apps/admin`, so both apps read the switches the same way. It exports `features()` (server only) and a reduced public copy for the browser. Only the exact string `"true"` turns a switch on, and a missing variable means off.

```env
# Pricing
PRICING_MODE=zones            # zones | distance | hybrid
FEATURE_DISTANCE_PRICING=false
FEATURE_DEMAND_PRICING=false
SERVICE_AREA=attica           # polygon in packages/geo/areas/attica.geojson

# Booking flow
FEATURE_PLACES=true
FEATURE_RETURN_TRIP=false
FEATURE_FLIGHT_TRACKING=false
FEATURE_CORPORATE=false
FEATURE_DRIVERS=false         # existing

# Contact
FEATURE_WHATSAPP=true
WHATSAPP_NUMBER=306900000000  # international, digits only

# Keys (server only; never PUBLIC_)
GOOGLE_MAPS_SERVER_KEY=
FLIGHT_PROVIDER=aerodatabox   # aerodatabox | flightaware
FLIGHT_PROVIDER_KEY=
QUOTE_SIGNING_SECRET=
```

`PRICING_MODE`:

- `zones`: today's behaviour. Nothing changes for Elite until you switch.
- `distance`: every trip is priced with the rules in section 3.
- `hybrid` (recommended): when both points fall inside zones that have a fixed route price (for example Airport → Centre), the fixed price is used; for any other address, distance pricing applies. Customers get the familiar airport prices, and every other address is still covered.

Each switch also checks its dependencies when the app starts. For example, `FEATURE_FLIGHT_TRACKING=true` without `FLIGHT_PROVIDER_KEY` logs an error, and the switch stays off. `FEATURE_RETURN_TRIP` works in every pricing mode.

## 3. How a distance price is calculated

This all happens on the server, in `packages/pricing` (`@tem/pricing`). It is a pure function with no database calls inside, so it can be fully tested.

```
quote(trip, class, rules) →
  1. route        = Google Routes (distance_km, duration_min with traffic at pick-up time)
  2. fixed route? = if PRICING_MODE=hybrid and a zone route price exists → use it, go to 6
  3. base         = class.base_fare + distance_km × class.per_km + duration_min × class.per_min
  4. adjustments  = + extra stops × stop_fee
                    + airport/port fee (if a point is inside an airport/port area)
                    × night factor (pick-up inside the night window)
                    × special-period factor (date ranges, e.g. Easter, August)
                    × demand factor (only with FEATURE_DEMAND_PRICING; 1.00–max, see below)
  5. floor        = max(result, class.minimum_fare)
  6. extras       = + selected extras (child seat, meet & greet…), unchanged
  7. return       = for a return trip, second leg priced the same way, then − return discount %
  8. rounding     = to €1 or €5 (setting), VAT included, VAT split shown as today
```

- **Hourly:** hours × class hourly rate. The km included = hours × `km_per_hour` (setting, for example 40). Extra km are charged afterwards from the admin at `extra_km_rate`, or a confirmed quote already includes them.
- **Waiting time:** free minutes (for example 60 at airports, 15 elsewhere), then a rate per minute, added from the admin after the trip like the existing price adjustments.
- **Demand factor (optional):** based on how full the class is in that hour (vehicles held or booked / active vehicles). For example, above 70 % full ×1.10, above 90 % ×1.20, never above `demand_max` (setting). The quote shows only the final price, never "surge".
- **Fixed price:** the quote response is `{prices, quote_id, expires_at, signature}`. The quote is stored in `quotes`. Checkout accepts only an unexpired quote whose signature matches. That is what makes the price fixed (item 12), and it also stops a browser from changing the price.

## 4. Database (new migrations, all additive)

| Migration | Contents |
|---|---|
| `0018_pricing_rules.sql` | Per-class rates: `base_fare`, `per_km`, `per_min`, `minimum_fare`, `km_per_hour`, `extra_km_rate`. Tables `pricing_periods` (from, to, factor, label), `pricing_areas` (airport/port polygons + fee), `pricing_settings` (night window and factor, stop fee, waiting rules, rounding, return discount, demand steps and max). All are versioned: every save writes a new row with `valid_from`, and each booking keeps the price breakdown it was sold at |
| `0019_quotes.sql` | `quotes`: trip details, places, distance_km, duration_min, prices per class, breakdown JSON, expires_at. `bookings` gets `quote_id`, `distance_km`, `duration_min`, `price_breakdown`. Hold length = duration + buffer |
| `0020_return_trips.sql` | `bookings.return_of uuid` (the outbound booking) + `trip_group_id`; one payment can cover two bookings; cancellation and refund rules for each leg |
| `0021_flights.sql` | `bookings.flight_number`, `flight_date`, `flight_status`, `flight_eta`, `flight_checked_at`; `flight_events` log; pick-up time shifts are recorded as booking events |
| `0022_corporate.sql` | `companies` (name, VAT number, billing address, terms, discount % or price list, credit limit, pay_on_account), `company_users` (role: booker/admin), `bookings.company_id`, `booked_by`, `guest_name`; monthly `company_statements` |

RLS works as it does today. Corporate users see only their company's bookings, and no internal rates.

## 5. Site changes (`apps/web`)

The booking widget follows Blacklane's pattern (your screenshots):

- **Step 1, the bar:**
  - tabs One way / By the hour;
  - pick-up and drop-off with autocomplete and a ✕ to clear;
  - date, pick-up time and flight number (the flight number appears only when the pick-up is an airport);
  - for hourly, a Duration dropdown: "2 hours (80 km included)"… "12 hours";
  - "Add return" (switch);
  - a "View options" button.
- **When an airport is chosen,** show a hint under the bar, like Blacklane: "Enter your flight number. We'll track your flight and meet you at the right terminal." Show it only with `FEATURE_FLIGHT_TRACKING`; otherwise the hint says "We'll meet you at arrivals."
- **Step 2, vehicle:**
  - a class card for each class, with photo, passengers, suitcases, a fixed price and "Free waiting 60 min";
  - a route summary with distance, time and a static map image (optional; Static Maps is billed);
  - full classes appear disabled.
- **Step 3, details and extras.**
- **Step 4, Viva payment.** The vehicle hold starts here, as today.
- **Address outside Attica:** an inline message and a link to the contact form. Nothing gets saved.
- **Corporate:** a `/business` login. Business users get the same booking widget with "Booking for" (guest name and phone), their company prices, and "Pay on account".

The design stays the Elite V2 design. Only the widget layout follows Blacklane.

## 6. Admin changes (`apps/admin`)

- **Pricing (new group, replaces Zone prices / Hourly rates when distance pricing is on):**
  - Rates per class
  - Fixed routes (the existing zone prices, used in hybrid mode)
  - Hourly
  - Night and special periods
  - Airports and ports
  - Waiting and stops
  - Demand
  - **Quote simulator:** enter two addresses, a date and a time, and see each class's price with the full breakdown before saving.
- **Booking detail:**
  - distance, duration and price breakdown;
  - return-trip link ("Outbound EP-… / Return EP-…");
  - flight card (status, ETA, last check, and a "Check now" button);
  - "Add waiting / extra km" adjustment.
- **Today and Bookings:** a flight delay badge, a "Pick-up moved 18:30 → 19:10" note, and an office alert email.
- **Companies (corporate):** list and detail pages, users, price list/discount, bookings, monthly statement with CSV export, and invoice details.
- **Settings:** the pricing settings move to the Pricing group, with human labels and units (in line with the design-fixes prompt).

## 7. Running costs the client pays (outside your fee)

| Service | What uses it | Note |
|---|---|---|
| Google Places (New) | autocomplete | already in place; per-session billing |
| Google Routes API | every quote: distance and time with traffic | billed per request; cache identical routes for 15 min and debounce the widget so that each "View options" press makes only one call |
| Google Static Maps | optional route image | can be left out |
| Flight data provider (for example AeroDataBox or FlightAware AeroAPI) | flight check + tracking | monthly plan or per-call pricing; check their current prices before quoting. Poll only for bookings in the next 24 h: every 30 min, then every 10 min in the last 3 h |

Set daily quotas and a budget alert in Google Cloud, on the client's account and card. This was already agreed for autocomplete.

## 8. Build order and effort (my estimate, Cursor-assisted)

| Phase | Contents | Days |
|---|---|---|
| B1 | `@tem/features`, switches in both apps, start-up checks, tests that every flag hides its UI and routes | 1 |
| B2 | Service area (Attica polygon, server check, autocomplete restriction) + Routes API wrapper in `@tem/places` + caching | 1.5 |
| B3 | `@tem/pricing` engine + 0018/0019 + signed quotes + `/api/quote` + checkout using the quote + holds sized by duration | 3 |
| B4 | Booking widget (one way / by the hour, airport hint, vehicle step with prices) + hourly km included | 3 |
| B5 | Admin Pricing area + quote simulator + booking breakdown + waiting/extra km adjustments | 3 |
| B6 | Return trip (0020, two linked bookings, one payment, refunds per leg) | 2 |
| B7 | Flight tracking (0021, provider adapter, scheduled job, pick-up shift, office alerts, admin card) | 2.5 |
| B8 | Demand factor (setting, steps, cap, tests) | 0.5 |
| B9 | Corporate (0022, business login, company prices, pay on account, statements, admin Companies) | 5 |
| B10 | QA across switch combinations (all off = today's behaviour exactly), emails, Viva test mode | 1.5 |
| W1 | WhatsApp: helper, site placements + Sanity settings, Manage my booking card, email block in all customer emails, admin link | 1 |
| | **Total** | **≈ 24 days** (about 193 h) |

B1–B5 make up the main change (distance pricing like Blacklane), about 11.5 days. B6–B9 and W1 are separate add-ons and can be sold and switched on one by one. W1 doesn't depend on anything else, so Cursor can do it first.

## 9. Decisions needed before Cursor starts

1. **Which client is this for?** Elite (NEVMA) or the friend's company?
   - For NEVMA, the VIP Transfers v1 scope explicitly excluded maps, route design and distance pricing, so this is a change request at €40/hour (≈ 193 h for everything, ≈ 92 h for B1–B5).
   - For the friend, it goes beyond the €2,500 booking engine, so it counts as the optional features at €40/hour.
2. **Pricing mode:** `hybrid` (fixed airport/port prices, distance for everything else) or pure `distance`.
3. **Rates per class:** base fare, € per km, € per minute, minimum fare, km included per hour. The client provides these numbers.
4. **Flight tracking:** pick a provider and who pays for it. Or, as a cheaper v1, a validated flight number plus a manual "delayed" button in the admin.
5. **Corporate:** pay on account (monthly invoice) or card only in v1? Price list per company, or one discount %?
6. **Demand pricing:** on or off at launch. It is legal, but it can annoy repeat customers; I suggest off, with only special periods at first.
7. **Return trip:** a return discount (%), and whether the return leg can be cancelled on its own.
