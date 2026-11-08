import { useEffect, useId, useRef, useState } from 'react';

export type PlaceValue = { placeId: string; lat: number; lng: number } | null;

export type AddressFieldProps = {
  id: string;
  label: string;
  name: string;
  placeholder?: string;
  value: string;
  place: PlaceValue;
  /** Hidden input name prefixes: pickup → pickupPlaceId|Lat|Lng */
  placePrefix: 'pickup' | 'dropoff';
  enabled: boolean;
  /** When distance pricing is on: check Attica after a place pick. */
  checkServiceArea?: boolean;
  outOfAreaText?: string;
  contactHref?: string;
  contactLabel?: string;
  whatsappHref?: string | null;
  whatsappLabel?: string;
  error?: string;
  autoComplete?: string;
  /** Called after a place pick / clear with pricing-area kind from /api/geo/check (airport|port|null). */
  onAreaKind?: (kind: string | null, label: string | null) => void;
  clearLabel?: string;
  onChange: (text: string, place: PlaceValue) => void;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
};

type Suggestion = { placeId: string; label: string; main: string; secondary: string };

const DEBOUNCE_MS = 300;

export async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
    if (!res.ok) return { ok: false };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false };
  }
}

/** V2 address field with optional Google Places suggestions (`.ddl` list like zone dropdown). */
export function AddressField({
  id,
  label,
  name,
  placeholder,
  value,
  place,
  placePrefix,
  enabled,
  checkServiceArea = false,
  outOfAreaText,
  contactHref = '/contact',
  contactLabel = 'contact us',
  whatsappHref = null,
  whatsappLabel = 'WhatsApp',
  error,
  autoComplete = 'street-address',
  onAreaKind,
  clearLabel = 'Clear',
  onChange,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: AddressFieldProps) {
  const listReactId = useId();
  const listId = `${id}-list-${listReactId}`;
  const liveId = `${id}-live-${listReactId}`;
  const outId = `${id}-out-area`;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [live, setLive] = useState('');
  const [outOfArea, setOutOfArea] = useState(false);
  const sessionRef = useRef(crypto.randomUUID());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const picking = useRef(false);

  const renewSession = () => {
    sessionRef.current = crypto.randomUUID();
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', away);
    return () => document.removeEventListener('click', away);
  }, [open]);

  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 3) {
      setItems([]);
      setOpen(false);
      setLive('');
      return;
    }
    timer.current = setTimeout(async () => {
      const result = await postJson<{ suggestions: Suggestion[] }>('/api/places/autocomplete', {
        input: q,
        sessionToken: sessionRef.current,
      });
      if (!result.ok || !result.data.suggestions?.length) {
        setItems([]);
        setOpen(false);
        setLive('');
        return;
      }
      setItems(result.data.suggestions);
      setActive(0);
      setOpen(true);
      setLive(`${result.data.suggestions.length} suggestions`);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, enabled]);

  const applyPlace = async (text: string, next: PlaceValue) => {
    if (!next) {
      setOutOfArea(false);
      onAreaKind?.(null, null);
      onChange(text, null);
      return;
    }
    if (!checkServiceArea) {
      setOutOfArea(false);
      onChange(text, next);
      return;
    }
    const check = await postJson<{ inArea: boolean; kind?: string | null; label?: string | null }>(
      '/api/geo/check',
      { lat: next.lat, lng: next.lng },
    );
    if (check.ok && check.data.inArea === false) {
      setOutOfArea(true);
      onAreaKind?.(null, null);
      onChange(text, null);
      return;
    }
    setOutOfArea(false);
    onAreaKind?.(check.ok ? check.data.kind ?? null : null, check.ok ? check.data.label ?? null : null);
    onChange(text, next);
  };

  const clear = () => {
    setOutOfArea(false);
    setItems([]);
    setOpen(false);
    onAreaKind?.(null, null);
    onChange('', null);
  };

  const pick = async (s: Suggestion) => {
    picking.current = true;
    setOpen(false);
    const details = await postJson<{ placeId: string; address: string; lat: number; lng: number }>(
      '/api/places/details',
      { placeId: s.placeId, sessionToken: sessionRef.current },
    );
    renewSession();
    if (!details.ok) {
      onChange(s.label, null);
      picking.current = false;
      return;
    }
    const d = details.data;
    await applyPlace(s.label || d.address, {
      placeId: d.placeId,
      lat: d.lat,
      lng: d.lng,
    });
    picking.current = false;
  };

  const onInput = (text: string) => {
    if (picking.current) return;
    setOutOfArea(false);
    // Editing after a pick clears the place.
    onChange(text, null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !items.length) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void pick(items[active]!);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const optId = (i: number) => `${id}-opt-${i}`;
  const invalid = Boolean(error) || ariaInvalid === true || ariaInvalid === 'true';
  const describedBy = [ariaDescribedBy, outOfArea ? outId : null].filter(Boolean).join(' ') || undefined;

  const message = outOfAreaText ?? 'We only serve Athens and Attica. For other destinations, {contact}.';
  const [before, after = ''] = message.split('{contact}');

  return (
    <div className={invalid || outOfArea ? 'f2 is-invalid ep-address' : 'f2 ep-address'} ref={root}>
      <label htmlFor={id}>{label}</label>
      <div className="ep-address-wrap" data-v2-extra>
        <input
          id={id}
          name={name}
          type="text"
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          role={enabled ? 'combobox' : undefined}
          aria-autocomplete={enabled ? 'list' : undefined}
          aria-expanded={enabled ? open : undefined}
          aria-controls={enabled && open ? listId : undefined}
          aria-activedescendant={enabled && open ? optId(active) : undefined}
          aria-invalid={invalid || outOfArea || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => {
            if (!sessionRef.current) renewSession();
          }}
          onKeyDown={onKeyDown}
        />
        {value ? (
          <button type="button" className="ep-address-clear" aria-label={clearLabel} onClick={clear}>
            ✕
          </button>
        ) : null}
      </div>
      <input type="hidden" name={`${placePrefix}PlaceId`} value={place?.placeId ?? ''} />
      <input type="hidden" name={`${placePrefix}Lat`} value={place?.lat ?? ''} />
      <input type="hidden" name={`${placePrefix}Lng`} value={place?.lng ?? ''} />
      {error ? (
        <span className="error" id={`${id}-err`}>
          {error}
        </span>
      ) : null}
      {outOfArea ? (
        <span className="error" id={outId} role="status">
          {before}
          <a href={contactHref}>{contactLabel}</a>
          {whatsappHref ? (
            <>
              {' '}
              / <a href={whatsappHref}>{whatsappLabel}</a>
            </>
          ) : null}
          {after}
        </span>
      ) : null}
      <span id={liveId} className="js-sr-only" aria-live="polite" data-v2-extra>
        {live}
      </span>
      {enabled && open && items.length > 0 ? (
        <ul role="listbox" id={listId} className="ddl ep-address-ddl" tabIndex={-1} data-v2-extra>
          {items.map((s, i) => (
            <li key={s.placeId} role="presentation">
              <button
                type="button"
                role="option"
                id={optId(i)}
                className="dd-opt"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(s)}
              >
                <span className="sb5725" aria-hidden="true">
                  {i === active ? '✓' : ''}
                </span>
                <span className="ep-address-main">{s.main}</span>
                {s.secondary ? <span className="ep-address-sec">{s.secondary}</span> : null}
              </button>
            </li>
          ))}
          <li className="ep-address-attr" role="presentation">
            <img src="/google-maps-on-non-white.svg" alt="Google Maps" width={66} height={18} />
          </li>
        </ul>
      ) : null}
    </div>
  );
}
