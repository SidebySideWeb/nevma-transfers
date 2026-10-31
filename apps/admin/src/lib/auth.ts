import type { AstroCookies } from 'astro';
import { createSupabaseServerClient } from './supabase';

export type StaffSession = {
  userId: string;
  email: string;
};

/** Returns the signed-in staff member, or null if missing / not staff. */
export async function getStaffSession(cookies: AstroCookies): Promise<StaffSession | null> {
  const supabase = createSupabaseServerClient(cookies);
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) return null;

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('user_id, email')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (staffError || !staff) return null;
  return {
    userId: staff.user_id,
    email: staff.email || userData.user.email || '',
  };
}

export async function signOut(cookies: AstroCookies): Promise<void> {
  const supabase = createSupabaseServerClient(cookies);
  await supabase.auth.signOut();
}
