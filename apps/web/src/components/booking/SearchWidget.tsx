import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  earliestPickupLocal,
  hourlyDurationLabel,
  meetsMinNotice,
  normaliseFlightNumber,
} from '../../lib/booking/hourly-labels';
import { DOW, MONTHS, isoToDdMmYyyy, monthCells, toIso } from '../v2/DateField';
import { postJson, type PlaceValue } from './AddressField';
import { formatEuroV2 } from './format';
import { PlaceKindIcon } from './PlaceKindIcon';
import type { DetailsState, SearchState } from './types';
import './SearchWidget.css';

export type FeaturedPlace = {
  code: string;
  name: string;
  address: string;
  placeId: string;
  lat: number;
  lng: number;
  /** airport | port | station | landmark | square | hotel | venue | area */
  kind: string;
};
export type FeaturedRoute = {
  from: FeaturedPlace;
  to: FeaturedPlace;
  durationMin: number;
  fromPriceCents: number;
};

/** What the widget hands to BookingApp (book) or to /book (home). No price fields. */
export type SearchWidgetPayload = {
  search: Partial<Pick<SearchState, 'type' | 'hours' | 'pickupLocal' | 'fromZone' | 'toZone'>>;
  details: Pick<
    DetailsState,
    'pickupAddress' | 'dropoffAddress' | 'pickupPlace' | 'dropoffPlace' | 'flightNumber'
  >;
};

export const SEARCH_PLACES_KEY = 'ep-search-places';

const DEFAULTS = {
  widgetLabel: 'Search',
  tabRoute: 'By route',
  tabHour: 'By the hour',
  pickup: 'Pick-up',
  dropoff: 'Drop-off',
  placeholder: 'Address, airport, hotel, …',
  date: 'Date',
  datePlaceholder: 'Select a date',
  time: 'Pick-up time',
  duration: 'Duration',
  flight: 'Flight number',
  flightPlaceholder: 'e.g. A3 603, LH1284',
  flightHint: 'Add your flight number so your chauffeur meets you at arrivals.',
  viewOptions: 'View options',
  anyAddress: 'Any address: keep typing',
  approx: 'approx. {min} min',
  fromPrice: 'from {price}',
  back: 'Back',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  outOfArea: 'We only serve Athens and Attica. For other destinations, contact us.',
  popularRoutes: 'Popular routes',
  fixedZones: 'Fixed zones',
  emptyMessage: "Set your pick-up anywhere in Athens and Attica. We'll be there on time.",
};
export type SearchWidgetStrings = Partial<Record<keyof typeof DEFAULTS, string>>;

export type SearchWidgetProps = {
  mode: 'home' | 'book';
  strings?: SearchWidgetStrings;
  minLeadMinutes?: number;
  timezone?: string;
  kmPerHour?: number;
  hourBounds?: { min: number; max: number };
  addressAutocomplete?: boolean;
  /** FEATURE_DISTANCE_PRICING: Attica check after a place pick. */
  checkServiceArea?: boolean;
  /** Omit to fetch `routesUrl` on first open. */
  routes?: FeaturedRoute[];
  routesUrl?: string;
  emptyMessage?: string;
  popularRoutesTitle?: string;
  initial?: {
    type?: 'transfer' | 'hourly';
    hours?: number;
    /** YYYY-MM-DD */
    date?: string;
    /** HH:mm */
    time?: string;
    pickupAddress?: string;
    pickupPlace?: PlaceValue;
    pickupKind?: string | null;
    dropoffAddress?: string;
    dropoffPlace?: PlaceValue;
    flightNumber?: string;
  };
  /** Field errors from BookingApp (`pickupAddress`, `dropoffAddress`, `pickupLocal`, `hours`). */
  errors?: Record<string, string>;
  busy?: boolean;
  /** Home mode: passengers sent in the /book query. */
  passengers?: number;
  /** Test hook: fixed clock. */
  now?: Date;
  /** Home mode navigation (default `window.location.assign`). */
  navigate?: (href: string) => void;
  /** Book mode: every change, so the parent state stays in sync. */
  onChange?: (payload: SearchWidgetPayload) => void;
  /** Book mode: View options. */
  onSubmit?: (payload: SearchWidgetPayload) => void;
};

type Field = 'pickup' | 'dropoff' | 'date' | 'time' | 'duration' | 'flight';
type Pt = { text: string; place: PlaceValue; zone: string | null; kind: string | null; typed: boolean };
type Suggestion = {
  placeId: string;
  label?: string;
  main: string;
  secondary: string;
  kind?: string;
};
type Item = { disabled?: boolean; pick: () => void };

const TIMES = Array.from({ length: 144 }, (_, i) => {
  const m = i * 10;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

/** /book: read (once) the place details the home widget stored, validated. Never trusts the shape. */
export function readSearchPlaces(): Partial<SearchWidgetPayload['details']> | null {
  try {
    const raw = sessionStorage.getItem(SEARCH_PLACES_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SEARCH_PLACES_KEY);
    const d = JSON.parse(raw) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '');
    const place = (v: unknown): PlaceValue => {
      const p = v as { placeId?: unknown; lat?: unknown; lng?: unknown } | null;
      return p && typeof p.placeId === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
        ? { placeId: p.placeId, lat: p.lat as number, lng: p.lng as number }
        : null;
    };
    return {
      pickupAddress: str(d.pickupAddress),
      dropoffAddress: str(d.dropoffAddress),
      pickupPlace: place(d.pickupPlace),
      dropoffPlace: place(d.dropoffPlace),
      flightNumber: str(d.flightNumber),
    };
  } catch {
    return null;
  }
}

/** `/book` query from the widget (zone codes only when a popular route set them; never prices). */
export function searchWidgetQuery(p: SearchWidgetPayload, passengers = 2): string {
  const q = new URLSearchParams();
  const type = p.search.type ?? 'transfer';
  q.set('type', type);
  if (p.search.fromZone) q.set('from', p.search.fromZone);
  if (type === 'transfer' && p.search.toZone) q.set('to', p.search.toZone);
  const [date, time] = (p.search.pickupLocal ?? '').split('T');
  if (date) q.set('date', date);
  if (time) q.set('time', time);
  if (type === 'hourly' && p.search.hours) q.set('hours', String(p.search.hours));
  if (passengers > 0) q.set('passengers', String(passengers));
  return `/book?${q.toString()}`;
}

/** Round a `YYYY-MM-DDTHH:mm` wall time up to the next 10 minutes. */
function roundUp10(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return local;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!));
  const r = d.getUTCMinutes() % 10;
  if (r) d.setUTCMinutes(d.getUTCMinutes() + 10 - r);
  return d.toISOString().slice(0, 16);
}

function ym(iso: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? { y: +m[1]!, m: +m[2]! } : null;
}

const emptyPt = (text = '', place: PlaceValue = null, kind: string | null = null): Pt => ({
  text,
  place,
  zone: null,
  kind,
  typed: false,
});

export function SearchWidget(props: SearchWidgetProps) {
  const {
    mode,
    minLeadMinutes = 120,
    timezone = 'Europe/Athens',
    kmPerHour = 40,
    hourBounds = { min: 3, max: 12 },
    addressAutocomplete = false,
    checkServiceArea = false,
    routesUrl = '/api/routes/featured',
    initial = {},
    errors = {},
    busy = false,
    passengers = 2,
  } = props;
  const s = { ...DEFAULTS };
  for (const [k, v] of Object.entries(props.strings ?? {})) if (v) (s as Record<string, string>)[k] = v;
  const emptyMessage = props.emptyMessage || s.emptyMessage;
  const routesTitle = props.popularRoutesTitle || s.popularRoutes;

  const base = useId();
  const panelId = `${base}-panel`;
  const listId = `${base}-list`;
  const id = (f: Field) => `${base}-${f}`;
  const optId = (i: number) => `${base}-o-${i}`;
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const refs = useRef<Partial<Record<Field, HTMLElement | null>>>({});
  const session = useRef('');
  const fetched = useRef(false);

  // Clock is set after mount (SSR-safe) unless a test pins it.
  const [clock, setClock] = useState<number | null>(props.now?.getTime() ?? null);
  useEffect(() => {
    if (clock === null) setClock(Date.now());
  }, [clock]);
  const earliest = useMemo(
    () =>
      clock === null ? '' : roundUp10(earliestPickupLocal(new Date(clock), minLeadMinutes, timezone)),
    [clock, minLeadMinutes, timezone],
  );
  const earliestDate = earliest.slice(0, 10);
  const earliestTime = earliest.slice(11, 16);

  const [type, setType] = useState<'transfer' | 'hourly'>(initial.type ?? 'transfer');
  const [pickup, setPickup] = useState<Pt>(() =>
    emptyPt(initial.pickupAddress, initial.pickupPlace ?? null, initial.pickupKind ?? null),
  );
  const [dropoff, setDropoff] = useState<Pt>(() =>
    emptyPt(initial.dropoffAddress, initial.dropoffPlace ?? null),
  );
  const [hours, setHours] = useState(initial.hours ?? hourBounds.min);
  const [date, setDate] = useState(initial.date ?? '');
  const [time, setTime] = useState(initial.time || earliestTime);
  const [flight, setFlight] = useState(initial.flightNumber ?? '');
  useEffect(() => {
    if (!time && earliestTime) setTime(earliestTime);
  }, [time, earliestTime]);

  const [focus, setFocus] = useState<Field | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [pinnedPlaces, setPinnedPlaces] = useState<FeaturedPlace[]>([]);
  const pinnedFetched = useRef(false);
  const [outOfArea, setOutOfArea] = useState<'pickup' | 'dropoff' | null>(null);
  const [fetchedRoutes, setFetchedRoutes] = useState<FeaturedRoute[]>([]);
  const [view, setView] = useState<{ y: number; m: number } | null>(null);
  const routes = props.routes ?? fetchedRoutes;

  const showFlight = pickup.kind === 'airport';
  const hourList = useMemo(
    () => Array.from({ length: Math.max(0, hourBounds.max - hourBounds.min + 1) }, (_, i) => hourBounds.min + i),
    [hourBounds.min, hourBounds.max],
  );
  const timeDisabled = (t: string) => Boolean(date && earliest) && !meetsMinNotice(`${date}T${t}`, earliest);

  // ---- payload ----
  // Zones only when a zone chip / popular route set them; Google picks clear them ('').
  const payload = useMemo<SearchWidgetPayload>(
    () => ({
      search: {
        type,
        ...(type === 'hourly' ? { hours } : {}),
        pickupLocal: date ? `${date}T${time}` : '',
        fromZone: pickup.zone ?? '',
        ...(type === 'transfer' ? { toZone: dropoff.zone ?? '' } : {}),
      },
      details: {
        pickupAddress: pickup.text,
        pickupPlace: pickup.place,
        dropoffAddress: type === 'transfer' ? dropoff.text : '',
        dropoffPlace: type === 'transfer' ? dropoff.place : null,
        flightNumber: showFlight ? flight : '',
      },
    }),
    [type, hours, date, time, pickup, dropoff, flight, showFlight],
  );
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChangeRef.current?.(payload);
  }, [payload]);

  // ---- panel content ----
  const cur = focus === 'pickup' ? pickup : focus === 'dropoff' ? dropoff : null;
  const q = cur?.typed ? cur.text.trim() : '';
  const suggestMode = addressAutocomplete && q.length >= 3 && outOfArea === null;
  const panelKind = !open || !focus
    ? null
    : focus === 'pickup' || focus === 'dropoff'
      ? outOfArea === focus
        ? 'area'
        : suggestMode
          ? 'suggest'
          : 'routes'
      : focus === 'flight'
        ? 'flight'
        : focus;

  const pickupZone =
    pickup.zone ?? routes.find((r) => r.from.placeId && r.from.placeId === pickup.place?.placeId)?.from.code ?? null;
  /** Unique zone anchors for the focused field (pinned public places first, then featured routes). */
  const shownZones: FeaturedPlace[] = useMemo(() => {
    if (type !== 'transfer') return [];
    const byCode = new Map<string, FeaturedPlace>();
    const add = (p: FeaturedPlace) => {
      if (p.code && p.placeId && !byCode.has(p.code)) byCode.set(p.code, p);
    };
    // Empty field: pinned library places (airport, Piraeus, Acropolis, Sounio, Syntagma).
    const fieldEmpty =
      (focus === 'pickup' && !pickup.text.trim()) || (focus === 'dropoff' && !dropoff.text.trim());
    if (fieldEmpty) {
      for (const p of pinnedPlaces) add(p);
    }
    if (focus === 'dropoff' && pickupZone) {
      for (const r of routes) if (r.from.code === pickupZone) add(r.to);
    } else if (focus === 'dropoff') {
      for (const r of routes) add(r.to);
    } else {
      for (const r of routes) {
        add(r.from);
        add(r.to);
      }
    }
    return [...byCode.values()];
  }, [type, focus, routes, pickupZone, pinnedPlaces, pickup.text, dropoff.text]);
  /** Full A→B rows only when both ends are still empty (quick fill). */
  const shownRoutes =
    type !== 'transfer'
      ? []
      : focus === 'pickup' && !pickup.text.trim() && !dropoff.text.trim()
        ? routes
        : focus === 'dropoff' && pickupZone
          ? routes.filter((r) => r.from.code === pickupZone)
          : [];

  useEffect(() => {
    if (!addressAutocomplete || q.length < 3) {
      setSuggestions([]);
      return;
    }
    let off = false;
    const t = setTimeout(async () => {
      session.current ||= globalThis.crypto?.randomUUID?.() ?? String(Math.random());
      const r = await postJson<{ suggestions: Suggestion[] }>('/api/places/autocomplete', {
        input: q,
        sessionToken: session.current,
      });
      if (off) return;
      setSuggestions(r.ok ? (r.data.suggestions ?? []) : []);
      setActive(0);
    }, 300);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [q, addressAutocomplete, focus]);

  useEffect(() => {
    if (!open || fetched.current || props.routes) return;
    fetched.current = true;
    fetch(routesUrl, { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.routes;
        if (Array.isArray(list)) setFetchedRoutes(list as FeaturedRoute[]);
      })
      .catch(() => {});
  }, [open, props.routes, routesUrl]);

  useEffect(() => {
    if (!open || !addressAutocomplete || pinnedFetched.current) return;
    pinnedFetched.current = true;
    fetch('/api/places/pinned', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d?.places) ? d.places : [];
        setPinnedPlaces(
          list.filter(
            (p: FeaturedPlace) =>
              p && typeof p.placeId === 'string' && typeof p.name === 'string' && p.lat != null,
          ),
        );
      })
      .catch(() => {});
  }, [open, addressAutocomplete]);

  // ---- actions ----
  const enter = (f: Field) => {
    setFocus(f);
    setOpen(true);
  };
  const collapse = () => setOpen(false);
  const focusField = (f: Field) => {
    enter(f);
    refs.current[f]?.focus();
  };
  const advance = (from: Field) => {
    const order: Field[] = type === 'transfer' ? ['pickup', 'dropoff', 'date', 'time'] : ['pickup', 'date', 'time'];
    const isEmpty = (f: Field) =>
      f === 'pickup' ? !pickup.text.trim() : f === 'dropoff' ? !dropoff.text.trim() : f === 'date' ? !date : false;
    const next = from === 'date' ? 'time' : order.slice(order.indexOf(from) + 1).find(isEmpty);
    if (next) focusField(next);
    else collapse();
  };
  const setPt = (f: 'pickup' | 'dropoff', v: Pt) => (f === 'pickup' ? setPickup(v) : setDropoff(v));

  const onAddr = (f: 'pickup' | 'dropoff', text: string) => {
    setPt(f, { text, place: null, zone: null, kind: null, typed: true });
    setOutOfArea(null);
    enter(f);
  };
  const pickSuggestion = async (f: 'pickup' | 'dropoff', sug: Suggestion) => {
    const d = await postJson<{ placeId: string; address: string; lat: number; lng: number }>(
      '/api/places/details',
      { placeId: sug.placeId, sessionToken: session.current },
    );
    session.current = globalThis.crypto?.randomUUID?.() ?? String(Math.random());
    const place: PlaceValue = d.ok ? { placeId: d.data.placeId, lat: d.data.lat, lng: d.data.lng } : null;
    let kind: string | null = null;
    if (place && checkServiceArea) {
      const c = await postJson<{ inArea: boolean; kind?: string | null }>('/api/geo/check', {
        lat: place.lat,
        lng: place.lng,
      });
      if (c.ok && c.data.inArea === false) {
        setOutOfArea(f);
        return;
      }
      kind = c.ok ? (c.data.kind ?? null) : null;
    }
    setPt(
      f,
      emptyPt(sug.label || sug.main || (d.ok ? d.data.address : ''), place, sug.kind ?? kind),
    );
    setOutOfArea(null);
    setSuggestions([]);
    advance(f);
  };
  const placePt = (p: FeaturedPlace): Pt => ({
    text: p.address || p.name,
    place: { placeId: p.placeId, lat: p.lat, lng: p.lng },
    // Zone codes (ath-airport); saved-place pins use a uuid id — never send that as a zone.
    zone: /^[0-9a-f-]{36}$/i.test(p.code) ? null : p.code,
    kind: p.kind,
    typed: false,
  });
  /** Fixed zone for the focused field only — other end stays as-is. */
  const pickZone = (f: 'pickup' | 'dropoff', p: FeaturedPlace) => {
    setPt(f, placePt(p));
    setOutOfArea(null);
    setSuggestions([]);
    advance(f);
  };
  const pickRoute = (r: FeaturedRoute) => {
    setPickup(placePt(r.from));
    setDropoff(placePt(r.to));
    setOutOfArea(null);
    focusField('date');
  };
  const pickDate = (iso: string) => {
    setDate(iso);
    if (earliest && !meetsMinNotice(`${iso}T${time}`, earliest)) setTime(earliestTime);
    focusField('time');
  };
  const pickTime = (t: string) => {
    setTime(t);
    collapse();
  };
  const submit = () => {
    collapse();
    if (mode === 'book') {
      props.onSubmit?.(payload);
      return;
    }
    try {
      sessionStorage.setItem(SEARCH_PLACES_KEY, JSON.stringify(payload.details));
    } catch {
      /* private mode: the query still carries zones, date and time */
    }
    (props.navigate ?? ((h) => window.location.assign(h)))(searchWidgetQuery(payload, passengers));
  };

  const zoneItems: Item[] =
    panelKind === 'routes' && focus && (focus === 'pickup' || focus === 'dropoff')
      ? shownZones.map((z) => ({ pick: () => pickZone(focus, z) }))
      : [];
  const routeItems: Item[] =
    panelKind === 'routes' ? shownRoutes.map((r) => ({ pick: () => pickRoute(r) })) : [];
  const items: Item[] =
    panelKind === 'routes'
      ? [...zoneItems, ...routeItems]
      : panelKind === 'suggest'
        ? suggestions.map((sg) => ({ pick: () => void pickSuggestion(focus as 'pickup' | 'dropoff', sg) }))
        : panelKind === 'duration'
          ? hourList.map((h) => ({
              pick: () => {
                setHours(h);
                advance('duration');
              },
            }))
          : panelKind === 'time'
            ? TIMES.map((t) => ({ disabled: timeDisabled(t), pick: () => pickTime(t) }))
            : [];

  useEffect(() => {
    setActive(
      panelKind === 'time' ? TIMES.indexOf(time) : panelKind === 'duration' ? hours - hourBounds.min : panelKind === 'suggest' ? 0 : -1,
    );
    if (panelKind === 'date') setView(null);
    // Initial highlight only when the panel content changes (omit time/hours from deps on purpose).
  }, [panelKind]);

  // Open lists at the current value; keep the active row in view.
  const centered = useRef<string | null>(null);
  useEffect(() => {
    const isList = panelKind === 'time' || panelKind === 'duration';
    if (!isList) centered.current = null;
    const box = panel.current?.querySelector<HTMLElement>('.ep-sw-panel-inner');
    const el = box?.querySelector<HTMLElement>('[data-active="true"]');
    if (!box || !el) return;
    if (isList && centered.current !== panelKind) {
      centered.current = panelKind;
      box.scrollTop +=
        el.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 2 + el.clientHeight / 2;
    } else {
      el.scrollIntoView?.({ block: 'nearest' });
    }
  }, [panelKind, active]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) collapse();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  // Mobile sheet: lock page scroll so the picker, not the page, scrolls.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const mq = window.matchMedia?.('(max-width: 767px)');
    if (!mq?.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      collapse();
      return;
    }
    if (e.key === 'Enter' && t.tagName === 'INPUT') e.preventDefault(); // never submit an enclosing form
    if (!open) {
      if (e.key === 'ArrowDown' && t.closest('[data-ep-field]')) setOpen(true);
      return;
    }
    if (e.key === 'Tab') {
      const all = Array.from(
        root.current?.querySelectorAll<HTMLElement>('input:not([type=hidden]),button:not(:disabled)') ?? [],
      ).filter((n) => n.tabIndex >= 0);
      const firstEl = all[0];
      const lastEl = all[all.length - 1];
      if (e.shiftKey && t === firstEl) {
        e.preventDefault();
        lastEl?.focus();
      } else if (!e.shiftKey && t === lastEl) {
        e.preventDefault();
        firstEl?.focus();
      }
      return;
    }
    if (!items.length || !t.closest('[data-ep-field]')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      let i = active;
      do i += d;
      while (i >= 0 && i < items.length && items[i]!.disabled);
      if (i >= 0 && i < items.length) setActive(i);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[active];
      if (it && !it.disabled) it.pick();
    }
  };

  // ---- render helpers ----
  const bad = (...keys: string[]) => keys.some((k) => errors[k]);
  const cls = (f: Field, extra = '', ...errKeys: string[]) =>
    `ep-sw-field ${extra} ${open && focus === f ? 'is-focus' : ''} ${bad(...errKeys) ? 'is-invalid' : ''}`.replace(/\s+/g, ' ').trim();
  const reg = (f: Field) => (el: HTMLElement | null) => {
    refs.current[f] = el;
  };
  const combo = (f: Field) => ({
    id: id(f),
    role: 'combobox' as const,
    'aria-expanded': open && focus === f,
    'aria-controls': panelId,
    'aria-haspopup': (f === 'date' ? 'dialog' : 'listbox') as 'dialog' | 'listbox',
    'aria-activedescendant': open && focus === f && active >= 0 && items.length ? optId(active) : undefined,
    'data-ep-field': f,
    onFocus: () => enter(f),
    onClick: () => enter(f),
  });
  const addr = (f: 'pickup' | 'dropoff', pt: Pt, label: string, errKey: string) => (
    <div className={cls(f, '', errKey)}>
      <label htmlFor={id(f)}>{label}</label>
      <input
        {...combo(f)}
        ref={reg(f)}
        type="text"
        autoComplete="off"
        aria-autocomplete="list"
        aria-invalid={bad(errKey) || undefined}
        placeholder={s.placeholder}
        value={pt.text}
        onChange={(e) => onAddr(f, e.target.value)}
      />
    </div>
  );
  const pick = (i: number) => ({
    id: optId(i),
    role: 'option' as const,
    tabIndex: -1,
    'aria-selected': i === active,
    'data-active': i === active ? 'true' : undefined,
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(), // keep focus on the field
    onClick: () => items[i]?.pick(),
  });
  const message = (text: string, icon?: string) => (
    <div className="ep-sw-msg" role="status">
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <p>{text}</p>
    </div>
  );

  const calendar = () => {
    const b = view ?? ym(date || earliestDate);
    const e = ym(earliestDate);
    if (!b) return null;
    const at = (off: number) => {
      const d = new Date(Date.UTC(b.y, b.m - 1 + off, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    };
    const shift = (n: number) => setView(at(n));
    return (
      <div className="ep-sw-cal" role="dialog" aria-label={s.date}>
        <button
          type="button"
          className="ep-sw-nav ep-sw-nav--prev"
          aria-label={s.prevMonth}
          disabled={Boolean(e) && b.y * 12 + b.m <= e!.y * 12 + e!.m}
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => shift(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="ep-sw-nav ep-sw-nav--next"
          aria-label={s.nextMonth}
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => shift(1)}
        >
          ›
        </button>
        <div className="ep-sw-months">
          {[0, 1].map((off) => {
            const { y, m } = at(off);
            return (
              <div key={off} className="ep-sw-month">
                <div className="ep-sw-month-title">
                  {MONTHS[m - 1]} {y}
                </div>
                <div className="ep-sw-dow" aria-hidden="true">
                  {DOW.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="ep-sw-days">
                  {monthCells(y, m).map((day, i) => {
                    if (day == null) return <span key={`e${i}`} />;
                    const iso = toIso(y, m, day);
                    return (
                      <button
                        key={iso}
                        type="button"
                        aria-label={`${day} ${MONTHS[m - 1]} ${y}`}
                        aria-pressed={iso === date}
                        disabled={iso < earliestDate}
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => pickDate(iso)}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const zonesTitle = s.fixedZones;
  let content: React.ReactNode = message(emptyMessage);
  if (panelKind === 'routes' && (shownZones.length || shownRoutes.length)) {
    content = (
      <>
        {shownZones.length ? (
          <>
            <h3 className="ep-sw-title">{zonesTitle}</h3>
            <ul role="listbox" id={listId} aria-label={zonesTitle} className="ep-sw-list">
              {shownZones.map((z, i) => (
                <li key={z.code} role="presentation">
                  <button type="button" className="ep-sw-opt" {...pick(i)}>
                    <span className="ep-sw-ico" aria-hidden="true">
                      <PlaceKindIcon kind={z.kind} />
                    </span>
                    <span className="ep-sw-main">{z.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {shownRoutes.length ? (
          <>
            <h3 className="ep-sw-title">{routesTitle}</h3>
            <ul
              role="listbox"
              id={shownZones.length ? undefined : listId}
              aria-label={routesTitle}
              className="ep-sw-list"
            >
              {shownRoutes.map((r, i) => (
                <li key={`${r.from.code}-${r.to.code}`} role="presentation">
                  <button type="button" className="ep-sw-opt" {...pick(shownZones.length + i)}>
                    <span className="ep-sw-ico" aria-hidden="true">
                      <PlaceKindIcon kind={r.from.kind} />
                    </span>
                    <span className="ep-sw-main">
                      {r.from.name} → {r.to.name}
                      <small>{s.approx.replace('{min}', String(r.durationMin))}</small>
                    </span>
                    {r.fromPriceCents > 0 ? (
                      <span className="ep-sw-price">{s.fromPrice.replace('{price}', formatEuroV2(r.fromPriceCents))}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {focus === 'dropoff' && pickup.text.trim() ? <p className="ep-sw-any">{s.anyAddress}</p> : null}
      </>
    );
  } else if (panelKind === 'suggest' && suggestions.length) {
    content = (
      <>
        <ul role="listbox" id={listId} aria-label={focus === 'pickup' ? s.pickup : s.dropoff} className="ep-sw-list">
          {suggestions.map((sg, i) => (
            <li key={sg.placeId} role="presentation">
              <button type="button" className="ep-sw-opt" {...pick(i)}>
                <span className="ep-sw-ico" aria-hidden="true">
                  <PlaceKindIcon kind={sg.kind} />
                </span>
                <span className="ep-sw-main">
                  {sg.main}
                  {sg.secondary ? <small>{sg.secondary}</small> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <img className="ep-sw-attr" src="/google-maps-on-non-white.svg" alt="Google Maps" width={66} height={18} />
      </>
    );
  } else if (panelKind === 'area') {
    content = message(s.outOfArea);
  } else if (panelKind === 'flight') {
    content = message(s.flightHint, '✈');
  } else if (panelKind === 'date') {
    content = calendar();
  } else if (panelKind === 'duration') {
    content = (
      <ul role="listbox" id={listId} aria-label={s.duration} className="ep-sw-list">
        {hourList.map((h, i) => (
          <li key={h} role="presentation">
            <button type="button" className="ep-sw-opt" {...pick(i)} aria-selected={h === hours}>
              <span className="ep-sw-main">{hourlyDurationLabel(h, kmPerHour)}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  } else if (panelKind === 'time') {
    content = (
      <ul role="listbox" id={listId} aria-label={s.time} className="ep-sw-list ep-sw-times">
        {TIMES.map((t, i) => (
          <li key={t} role="presentation">
            <button
              type="button"
              className="ep-sw-opt"
              {...pick(i)}
              aria-selected={t === time}
              disabled={timeDisabled(t)}
            >
              <span className="ep-sw-main">{t}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  const fieldName = focus
    ? { pickup: s.pickup, dropoff: s.dropoff, date: s.date, time: s.time, duration: s.duration, flight: s.flight }[focus]
    : s.widgetLabel;
  const cta = (
    <button type="button" className="btn btn-gold ep-sw-submit" disabled={busy} onClick={submit}>
      {s.viewOptions}
    </button>
  );

  return (
    <div
      ref={root}
      className={`ep-sw ep-sw--${mode}`}
      role="search"
      aria-label={s.widgetLabel}
      data-open={open ? '1' : '0'}
      data-focus={open && focus ? focus : undefined}
      data-type={type}
      onKeyDown={onKeyDown}
    >
      <div className="ep-sw-tabs" role="tablist" aria-label={`${s.tabRoute} / ${s.tabHour}`}>
        {(['transfer', 'hourly'] as const).map((tp) => (
          <button
            key={tp}
            type="button"
            role="tab"
            className="ep-sw-tab"
            aria-selected={type === tp}
            onClick={() => {
              setType(tp);
              collapse();
            }}
          >
            {tp === 'transfer' ? s.tabRoute : s.tabHour}
          </button>
        ))}
      </div>

      <div className="ep-sw-box">
        <div className="ep-sw-sheet-head">
          <button type="button" aria-label={s.back} onClick={collapse}>
            ←
          </button>
          <span>{fieldName}</span>
        </div>
        <div className="ep-sw-bar">
          {addr('pickup', pickup, s.pickup, 'pickupAddress')}
          {type === 'transfer' ? (
            addr('dropoff', dropoff, s.dropoff, 'dropoffAddress')
          ) : (
            <div className={cls('duration', 'ep-sw-field--duration', 'hours')}>
              <label htmlFor={id('duration')}>{s.duration}</label>
              <button
                type="button"
                {...combo('duration')}
                ref={reg('duration')}
                aria-invalid={bad('hours') || undefined}
                title={hourlyDurationLabel(hours, kmPerHour)}
              >
                <span>{hours === 1 ? '1 hour' : `${hours} hours`}</span>
                <span aria-hidden="true">⌄</span>
              </button>
            </div>
          )}
          <div className={cls('date', 'ep-sw-field--date', 'pickupLocal')}>
            <label htmlFor={id('date')}>{s.date}</label>
            <button type="button" {...combo('date')} ref={reg('date')} data-empty={date ? '0' : '1'} aria-invalid={bad('pickupLocal') || undefined}>
              <span>{date ? isoToDdMmYyyy(date) : s.datePlaceholder}</span>
              <span aria-hidden="true">⌄</span>
            </button>
          </div>
          <div className={cls('time', '', 'pickupLocal')}>
            <label htmlFor={id('time')}>{s.time}</label>
            <button type="button" {...combo('time')} ref={reg('time')}>
              <span>{time || '--:--'}</span>
              <span aria-hidden="true">⌄</span>
            </button>
          </div>
          <div className="ep-sw-cta">{cta}</div>
        </div>
        {showFlight ? (
          <div className="ep-sw-bar ep-sw-bar--flight">
            <div className={cls('flight')}>
              <label htmlFor={id('flight')}>{s.flight}</label>
              <input
                {...combo('flight')}
                ref={reg('flight')}
                type="text"
                autoComplete="off"
                placeholder={s.flightPlaceholder}
                value={flight}
                onChange={(e) => setFlight(normaliseFlightNumber(e.target.value))}
              />
            </div>
          </div>
        ) : null}
        <div
          id={panelId}
          ref={panel}
          className="ep-sw-panel"
          aria-hidden={!open}
          aria-live={panelKind === 'suggest' ? 'polite' : undefined}
        >
          <div className="ep-sw-panel-inner">{open ? content : null}</div>
        </div>
        {open ? <div className="ep-sw-sheet-cta">{cta}</div> : null}
      </div>
    </div>
  );
}

export default SearchWidget;
