import { useCallback, useEffect, useState, type FormEvent } from 'react';
import BookingApp, { type BookingAppProps } from '../booking/BookingApp';
import { formatEuroV2 } from '../booking/format';
import { fill } from '../booking/v2/journey';

type Me = {
  companyName: string;
  email: string;
  role: 'admin' | 'booker';
  payOnAccount: boolean;
};
type Tab = 'book' | 'bookings' | 'statements' | 'users';
type Row = {
  reference: string;
  status: string;
  pickupAt: string;
  route: string;
  guestName: string | null;
  costCenter: string | null;
  priceCents: number;
  cancellable: boolean;
};
type Statement = {
  id: string;
  periodFrom: string;
  periodTo: string;
  totalCents: number;
  status: string;
};
type CompanyUser = { id: string; email: string; role: 'admin' | 'booker'; active: boolean };

const TOKEN_KEY = 'biz-token';

export type BusinessAppProps = Omit<BookingAppProps, 'corporate' | 'initialVehicleQuery'>;

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(iso)) + ' (Athens)';

/**
 * Magic-link sign-in lands here with `#access_token=...`. The token lives in sessionStorage only and is
 * sent as a Bearer header; the server resolves the member on every call. ponytail: no refresh token,
 * so a session lasts the Supabase access-token lifetime (1 hour default), then the member signs in again.
 */
function takeToken(): { token: string | null; linkError: boolean } {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const fromLink = hash.get('access_token');
  const linkError = hash.has('error');
  if (fromLink || linkError) window.history.replaceState(null, '', window.location.pathname);
  if (fromLink) sessionStorage.setItem(TOKEN_KEY, fromLink);
  return { token: sessionStorage.getItem(TOKEN_KEY), linkError };
}

export default function BusinessApp(props: BusinessAppProps) {
  const { strings } = props;
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'out'>('loading');
  const [tab, setTab] = useState<Tab>('book');

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMe(null);
    setPhase('out');
  }, []);

  /** Authenticated fetch; a 401 ends the session. */
  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
          authorization: `Bearer ${token}`,
        },
      });
      if (res.status === 401) signOut();
      return res;
    },
    [token, signOut],
  );

  useEffect(() => {
    const { token: t, linkError } = takeToken();
    if (!t || linkError) {
      setPhase('out');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/corporate/me', { headers: { authorization: `Bearer ${t}` } });
        if (!res.ok) throw new Error('me');
        setMe((await res.json()) as Me);
        setToken(t);
        setPhase('ready');
      } catch {
        sessionStorage.removeItem(TOKEN_KEY);
        setPhase('out');
      }
    })();
  }, []);

  if (phase === 'loading') {
    return (
      <section data-block="appBody" className="s39f3a" data-v2-extra>
        <p className="s0a0a6" role="status">
          {strings['business.app.loading']}
        </p>
      </section>
    );
  }
  if (phase === 'out' || !me || !token) {
    return (
      <section data-block="appBody" className="s39f3a" data-v2-extra>
        <div className="s8f7a6">
          <p className="s0a0a6" role="alert">
            {strings['business.app.expired']}
          </p>
          <a className="btn btn-gold" href="/business">
            {strings['business.app.signIn']}
          </a>
        </div>
      </section>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'book', label: strings['business.tab.book'] ?? '' },
    { id: 'bookings', label: strings['business.tab.bookings'] ?? '' },
    { id: 'statements', label: strings['business.tab.statements'] ?? '' },
    ...(me.role === 'admin'
      ? [{ id: 'users' as const, label: strings['business.tab.users'] ?? '' }]
      : []),
  ];

  return (
    <div data-v2-extra className="biz-app">
      <div className="biz-bar">
        <p className="biz-who">
          {fill(strings['business.app.signedInAs'], { email: me.email, company: me.companyName })}
        </p>
        <div role="tablist" aria-label={strings['business.app.title']} className="biz-tabs">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              id={`biz-tab-${x.id}`}
              aria-selected={tab === x.id}
              aria-controls={`biz-panel-${x.id}`}
              className={tab === x.id ? 'biz-tab is-on' : 'biz-tab'}
              onClick={() => setTab(x.id)}
            >
              {x.label}
            </button>
          ))}
        </div>
        <button type="button" className="biz-link" onClick={signOut}>
          {strings['business.app.signOut']}
        </button>
      </div>

      <div
        role="tabpanel"
        id="biz-panel-book"
        aria-labelledby="biz-tab-book"
        hidden={tab !== 'book'}
      >
        <BookingApp
          {...props}
          corporate={{
            accessToken: token,
            payOnAccount: me.payOnAccount,
            companyName: me.companyName,
          }}
        />
      </div>
      <div
        role="tabpanel"
        id="biz-panel-bookings"
        aria-labelledby="biz-tab-bookings"
        hidden={tab !== 'bookings'}
      >
        {tab === 'bookings' ? <Bookings api={api} strings={strings} /> : null}
      </div>
      <div
        role="tabpanel"
        id="biz-panel-statements"
        aria-labelledby="biz-tab-statements"
        hidden={tab !== 'statements'}
      >
        {tab === 'statements' ? <Statements api={api} strings={strings} /> : null}
      </div>
      {me.role === 'admin' ? (
        <div
          role="tabpanel"
          id="biz-panel-users"
          aria-labelledby="biz-tab-users"
          hidden={tab !== 'users'}
        >
          {tab === 'users' ? <Users api={api} strings={strings} /> : null}
        </div>
      ) : null}
    </div>
  );
}

type PanelProps = {
  api: (path: string, init?: RequestInit) => Promise<Response>;
  strings: Record<string, string>;
};

const errorText = async (res: Response, fallback: string) =>
  ((await res.json().catch(() => null)) as { message?: string } | null)?.message || fallback;

function Bookings({ api, strings }: PanelProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [range, setRange] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const res = await api(`/api/corporate/bookings?when=${range}&q=${encodeURIComponent(q)}`);
    if (!res.ok) return setMsg(await errorText(res, strings['business.app.error'] ?? ''));
    setRows(((await res.json()) as { bookings: Row[] }).bookings);
  }, [api, range, q, strings]);

  useEffect(() => {
    // Reload on range change; the search text applies on submit.
    void load();
  }, [range, load]);

  const cancel = async (reference: string) => {
    if (!window.confirm(fill(strings['business.bookings.cancelConfirm'], { reference }))) return;
    const res = await api(`/api/corporate/bookings/${encodeURIComponent(reference)}/cancel`, {
      method: 'POST',
    });
    setMsg(
      res.ok
        ? fill(strings['business.bookings.cancelled'], { reference })
        : await errorText(res, strings['business.app.error'] ?? ''),
    );
    if (res.ok) void load();
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    void load();
  };

  return (
    <section data-block="appBody" className="s39f3a" data-v2-extra>
      <div className="s8f7a6">
        <form className="biz-filters" onSubmit={onSearch} role="search">
          <div className="f2">
            <label htmlFor="biz-q">{strings['business.bookings.search']}</label>
            <input id="biz-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="biz-range" role="group" aria-label={strings['business.tab.bookings']}>
            {(['upcoming', 'past', 'all'] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={range === r ? 'biz-tab is-on' : 'biz-tab'}
                aria-pressed={range === r}
                onClick={() => setRange(r)}
              >
                {strings[`business.bookings.${r}`]}
              </button>
            ))}
          </div>
        </form>
        <p className="biz-note" role="status" aria-live="polite">
          {msg}
        </p>
        {rows && rows.length === 0 ? (
          <p className="s0a0a6">{strings['business.bookings.empty']}</p>
        ) : null}
        {rows && rows.length > 0 ? (
          <div className="biz-scroll">
            <table className="biz-table">
              <thead>
                <tr>
                  <th scope="col">{strings['business.col.reference']}</th>
                  <th scope="col">{strings['business.col.pickup']}</th>
                  <th scope="col">{strings['business.col.route']}</th>
                  <th scope="col">{strings['business.col.guest']}</th>
                  <th scope="col">{strings['business.col.costCenter']}</th>
                  <th scope="col">{strings['business.col.amount']}</th>
                  <th scope="col">{strings['business.col.status']}</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.reference}>
                    <td>{r.reference}</td>
                    <td>{when(r.pickupAt)}</td>
                    <td>{r.route}</td>
                    <td>{r.guestName ?? ''}</td>
                    <td>{r.costCenter ?? ''}</td>
                    <td>{formatEuroV2(r.priceCents)}</td>
                    <td>{r.status}</td>
                    <td>
                      {r.cancellable ? (
                        <button
                          type="button"
                          className="biz-link"
                          onClick={() => void cancel(r.reference)}
                        >
                          {strings['business.bookings.cancel']}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Statements({ api, strings }: PanelProps) {
  const [rows, setRows] = useState<Statement[] | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const res = await api('/api/corporate/statements');
      if (!res.ok) return setMsg(await errorText(res, strings['business.app.error'] ?? ''));
      setRows(((await res.json()) as { statements: Statement[] }).statements);
    })();
  }, [api, strings]);

  const download = async (s: Statement) => {
    const res = await api(`/api/corporate/statements/${s.id}.csv`);
    if (!res.ok) return setMsg(await errorText(res, strings['business.app.error'] ?? ''));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${s.periodFrom}-${s.periodTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section data-block="appBody" className="s39f3a" data-v2-extra>
      <div className="s8f7a6">
        <p className="biz-note" role="status" aria-live="polite">
          {msg}
        </p>
        {rows && rows.length === 0 ? (
          <p className="s0a0a6">{strings['business.statements.empty']}</p>
        ) : null}
        {rows && rows.length > 0 ? (
          <div className="biz-scroll">
            <table className="biz-table">
              <thead>
                <tr>
                  <th scope="col">{strings['business.col.period']}</th>
                  <th scope="col">{strings['business.col.amount']}</th>
                  <th scope="col">{strings['business.col.status']}</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.periodFrom} – {s.periodTo}
                    </td>
                    <td>{formatEuroV2(s.totalCents)}</td>
                    <td>{s.status}</td>
                    <td>
                      <button type="button" className="biz-link" onClick={() => void download(s)}>
                        {strings['business.statements.download']}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Users({ api, strings }: PanelProps) {
  const [users, setUsers] = useState<CompanyUser[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'booker'>('booker');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const res = await api('/api/corporate/users');
    if (!res.ok) return setMsg(await errorText(res, strings['business.app.error'] ?? ''));
    setUsers(((await res.json()) as { users: CompanyUser[] }).users);
  }, [api, strings]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const res = await api('/api/corporate/users', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
    setMsg(
      res.ok
        ? (strings['business.users.invited'] ?? '')
        : await errorText(res, strings['business.app.error'] ?? ''),
    );
    if (res.ok) {
      setEmail('');
      void load();
    }
  };

  const toggle = async (u: CompanyUser) => {
    const res = await api('/api/corporate/users', {
      method: 'PATCH',
      body: JSON.stringify({ id: u.id, active: !u.active }),
    });
    if (!res.ok) setMsg(await errorText(res, strings['business.app.error'] ?? ''));
    else void load();
  };

  return (
    <section data-block="appBody" className="s39f3a" data-v2-extra>
      <div className="s8f7a6">
        <form className="biz-login" onSubmit={invite}>
          <h2 className="biz-h">{strings['business.users.invite']}</h2>
          <div className="f2">
            <label htmlFor="biz-invite-email">{strings['business.col.email']}</label>
            <input
              id="biz-invite-email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="f2">
            <label htmlFor="biz-invite-role">{strings['business.col.role']}</label>
            <select
              id="biz-invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'booker')}
            >
              <option value="booker">{strings['business.users.booker']}</option>
              <option value="admin">{strings['business.users.admin']}</option>
            </select>
          </div>
          <button className="btn btn-gold" type="submit">
            {strings['business.users.send']}
          </button>
        </form>
        <p className="biz-note" role="status" aria-live="polite">
          {msg}
        </p>
        {users && users.length > 0 ? (
          <div className="biz-scroll">
            <table className="biz-table">
              <thead>
                <tr>
                  <th scope="col">{strings['business.col.email']}</th>
                  <th scope="col">{strings['business.col.role']}</th>
                  <th scope="col">{strings['business.col.status']}</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>
                      {u.role === 'admin'
                        ? strings['business.users.admin']
                        : strings['business.users.booker']}
                    </td>
                    <td>{u.active ? '' : strings['business.users.inactive']}</td>
                    <td>
                      <button type="button" className="biz-link" onClick={() => void toggle(u)}>
                        {u.active
                          ? strings['business.users.deactivate']
                          : strings['business.users.reactivate']}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
