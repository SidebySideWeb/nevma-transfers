import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Open on-account balance for a company (cents).
 * Prefer this over `company_open_balance_cents` RPC — that function is service-role only (0032).
 * Staff can read bookings under RLS, so sum here.
 */
export async function companyOpenBalanceCents(
  supabase: SupabaseClient,
  companyId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('bookings')
    .select('price_cents')
    .eq('company_id', companyId)
    .eq('payment_method', 'on_account')
    .not('status', 'in', '(cancelled,expired)')
    .in('payment_status', ['unpaid', 'partially_refunded']);
  if (error) return 0;
  return (data ?? []).reduce((s, r) => s + Number(r.price_cents ?? 0), 0);
}
