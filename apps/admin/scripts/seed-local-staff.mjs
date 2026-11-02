/** Ensure office@tem.local staff exists for local admin e2e after a db reset. */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const EMAIL = 'office@tem.local';
const PASS = 'OfficePass123!';

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
let user = listed.data.users.find((u) => (u.email || '').toLowerCase() === EMAIL);
if (!user) {
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  user = created.data.user;
} else {
  await admin.auth.admin.updateUserById(user.id, { password: PASS, email_confirm: true });
}

const { error } = await admin.from('staff').upsert({
  user_id: user.id,
  email: EMAIL,
  name: 'Office',
});
if (error) throw error;
console.log('staff ready', user.id);
