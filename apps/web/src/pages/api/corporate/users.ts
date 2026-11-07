import type { APIRoute } from 'astro';
import { z } from 'zod';
import { BookingError } from '../../../lib/booking/types';
import { getPublicEnv } from '../../../lib/env';
import {
  corporateOff,
  failMember,
  inviteCompanyUser,
  listCompanyUsers,
  requireAdmin,
  requireMember,
  setCompanyUserActive,
} from '../../../lib/server/corporate';
import { json } from '../../../lib/server/http';

export const prerender = false;

const Invite = z.object({ email: z.email(), role: z.enum(['admin', 'booker']) }).strict();
const Toggle = z.object({ id: z.uuid(), active: z.boolean() }).strict();

const parse = async <T extends z.ZodType>(schema: T, request: Request): Promise<z.infer<T>> => {
  const r = schema.safeParse(await request.json().catch(() => null));
  if (!r.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: r.error.message,
    });
  }
  return r.data;
};

export const GET: APIRoute = async ({ request }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const member = await requireMember(request);
    requireAdmin(member);
    return json({ users: await listCompanyUsers(member) });
  } catch (e) {
    return failMember(e);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const member = await requireMember(request);
    requireAdmin(member);
    const body = await parse(Invite, request);
    const site = getPublicEnv().PUBLIC_SITE_URL.replace(/\/$/, '');
    await inviteCompanyUser({
      companyId: member.companyId,
      email: body.email,
      role: body.role,
      redirectTo: `${site}/business/app`,
    });
    return json({ ok: true });
  } catch (e) {
    return failMember(e);
  }
};

/** PATCH { id, active } deactivates or reactivates a user of the caller's company. */
export const PATCH: APIRoute = async ({ request }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const member = await requireMember(request);
    requireAdmin(member);
    const body = await parse(Toggle, request);
    await setCompanyUserActive(member, body.id, body.active);
    return json({ ok: true });
  } catch (e) {
    return failMember(e);
  }
};

/** DELETE { id } deactivates (never hard-deletes) a user of the caller's company. */
export const DELETE: APIRoute = async ({ request }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const member = await requireMember(request);
    requireAdmin(member);
    const body = await parse(z.object({ id: z.uuid() }).strict(), request);
    await setCompanyUserActive(member, body.id, false);
    return json({ ok: true });
  } catch (e) {
    return failMember(e);
  }
};
