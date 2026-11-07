import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// B9 corporate accounts: with FEATURE_CORPORATE off every corporate route is a 404 and does no work.
type Handler = (ctx: never) => Promise<Response>;
type Mod = Record<string, Handler | boolean>;

const ctx = (method: string, path: string) =>
  ({
    request: new Request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
      body: method === 'GET' ? undefined : JSON.stringify({ email: 'a@b.co' }),
    }),
    params: { ref: 'EP-1', id: '00000000-0000-4000-8000-000000000000' },
    url: new URL(`http://localhost${path}`),
    cookies: { get: () => undefined, set: () => undefined },
    clientAddress: '127.0.0.1',
  }) as never;

const routes: { name: string; load: () => Promise<Mod>; method: string; path: string }[] = [
  { name: 'login', load: () => import('../../pages/api/corporate/login'), method: 'POST', path: '/api/corporate/login' },
  { name: 'me', load: () => import('../../pages/api/corporate/me'), method: 'GET', path: '/api/corporate/me' },
  {
    name: 'book-on-account',
    load: () => import('../../pages/api/corporate/book-on-account'),
    method: 'POST',
    path: '/api/corporate/book-on-account',
  },
  { name: 'book-card', load: () => import('../../pages/api/corporate/book-card'), method: 'POST', path: '/api/corporate/book-card' },
  { name: 'bookings', load: () => import('../../pages/api/corporate/bookings'), method: 'GET', path: '/api/corporate/bookings' },
  {
    name: 'bookings cancel',
    load: () => import('../../pages/api/corporate/bookings/[ref]/cancel'),
    method: 'POST',
    path: '/api/corporate/bookings/EP-1/cancel',
  },
  { name: 'statements', load: () => import('../../pages/api/corporate/statements'), method: 'GET', path: '/api/corporate/statements' },
  {
    name: 'statement csv',
    load: () => import('../../pages/api/corporate/statements/[id].csv'),
    method: 'GET',
    path: '/api/corporate/statements/x.csv',
  },
  { name: 'users GET', load: () => import('../../pages/api/corporate/users'), method: 'GET', path: '/api/corporate/users' },
  { name: 'users POST', load: () => import('../../pages/api/corporate/users'), method: 'POST', path: '/api/corporate/users' },
];

describe('corporate switch-off', () => {
  const prev = process.env.FEATURE_CORPORATE;

  beforeEach(() => {
    process.env.FEATURE_CORPORATE = 'false';
    vi.resetModules();
  });

  afterEach(() => {
    if (prev == null) delete process.env.FEATURE_CORPORATE;
    else process.env.FEATURE_CORPORATE = prev;
  });

  it.each(routes)('FEATURE_CORPORATE=false: $name returns 404', async ({ load, method, path }) => {
    const mod = await load();
    const handler = mod[method === 'GET' ? 'GET' : 'POST'] as Handler;
    const res = await handler(ctx(method, path));
    expect(res.status).toBe(404);
  });

  it('FEATURE_CORPORATE=true: me without a Bearer token is 401, not 404', async () => {
    process.env.FEATURE_CORPORATE = 'true';
    vi.resetModules();
    const { GET } = await import('../../pages/api/corporate/me');
    const res = await GET({
      request: new Request('http://localhost/api/corporate/me'),
    } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });
});
