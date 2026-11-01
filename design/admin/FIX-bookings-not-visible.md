# Bookings exist in the database but the admin shows none

The admin reads bookings with the signed-in staff session, so the database's row-level security decides what it sees. An empty list with no error almost always has one of five causes. Run the checks in the Supabase SQL editor of **the project the admin is connected to**, in order; stop at the first one that explains it.

## 1. Is the admin connected to the same Supabase project?

In Vercel → the admin project → Settings → Environment Variables, compare `PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) with the URL of the project where you see the bookings in the Table Editor. Different project → fix the variable for Production and Preview, then redeploy.

## 2. What bookings are there?

```sql
select status, payment_status, source, count(*), min(pickup_at), max(pickup_at)
from public.bookings group by 1, 2, 3 order by 1;
```

- Only `pending` or `expired` rows: these are unpaid test bookings. They never appear under Upcoming. The list needs a way to see them: the prompt below adds an "All" tab and puts pending and expired under Past.
- Pick-up dates in the past: open the **Past** tab.
- `source` column missing (error): migration 0011 is not applied to this database: see check 4.

## 3. Is your login a staff user?

```sql
select u.id as auth_id, u.email, s.user_id as staff_user_id
from auth.users u left join public.staff s on s.user_id = u.id
where u.email ilike 'dgeronikolos@sidebysideweb.gr';
```

`staff_user_id` must equal `auth_id`. If it is empty or different (for example the staff row was created with another id), fix it:

```sql
insert into public.staff (user_id, email)
select id, email from auth.users where email ilike 'dgeronikolos@sidebysideweb.gr'
on conflict (user_id) do nothing;
```

## 4. Are the new migrations applied to this database?

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'bookings'
  and column_name in ('source', 'customer_id', 'list_price_cents');
select to_regclass('public.calendar_items'), to_regclass('public.customers');
```

Three column names and two non-null results mean 0011 is applied. If not, the admin code selects columns that do not exist, the query fails, and the page shows "No bookings". Apply the migration (`supabase db push` to this project) and reload.

## 5. Does the admin hide query errors?

If the checks above are fine, give Cursor this prompt:

```
The admin's /bookings page shows "No bookings" although bookings exist (see design/admin/FIX-bookings-not-visible.md). Fix it:
1. Every list query in apps/admin (bookings, calendar, customers, fleet, prices) must check `error` from Supabase. On an error, show a red Banner "Could not load bookings: <message>" with role="alert" and log it on the server (no personal data); never show the empty state on an error. Add a Vitest test for the bookings loader that returns an error.
2. Bookings tabs: Upcoming = confirmed and assigned with pick-up from now; Need a vehicle = confirmed without a vehicle; Pending payment = pending with a live hold; Past = pick-up before now, any status, plus expired; Cancelled; add "All" (every booking, newest pick-up first). Counts on each tab.
3. The stat strip counts must use the same queries as the tabs.
4. Log in as the staff user and confirm that every booking in `select count(*) from bookings` appears under All.
Run the admin tests and report pass/fail.
```
