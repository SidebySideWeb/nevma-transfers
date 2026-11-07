import type { APIRoute } from 'astro';
import {
  corporateOff,
  failMember,
  listCompanyStatements,
  requireMember,
} from '../../../lib/server/corporate';
import { json } from '../../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const off = corporateOff();
  if (off) return off;
  try {
    const member = await requireMember(request);
    return json({ statements: await listCompanyStatements(member) });
  } catch (e) {
    return failMember(e);
  }
};
