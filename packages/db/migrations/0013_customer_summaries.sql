-- 0013 Customer list for the admin (decided by the user 1 Nov 2026). Needs 0011 (customers).
-- One row per customer with booking count, last pick-up, money actually paid (payments minus refunds)
-- and whether any booking had VIP security. security_invoker: staff only, through RLS.
create view public.customer_summaries with (security_invoker = true) as
select c.id, c.email, c.name, c.phone, c.company, c.vat_number, c.notes, c.created_at,
       count(b.id)::int as bookings_count,
       max(b.pickup_at) as last_pickup_at,
       coalesce(bool_or(b.vip_security), false) as has_vip_security,
       coalesce(sum(p.net_cents), 0)::int as paid_cents
  from public.customers c
  left join public.bookings b on b.customer_id = c.id
  left join lateral (
    select sum(case when kind = 'payment' then amount_cents else -amount_cents end) as net_cents
      from public.payments where booking_id = b.id and status = 'succeeded'
  ) p on true
 group by c.id;
revoke all on public.customer_summaries from anon;
grant select on public.customer_summaries to authenticated;
