import { useMemo, useState } from 'react';

export type HomeFleetItem = {
  key: string;
  name: string;
  tagline?: string | null;
  photoUrl?: string | null;
  photoAlt?: string | null;
};

type Props = {
  items: HomeFleetItem[];
  eyebrow: string;
  titleBefore: string;
  titleAccent: string;
  titleAfter: string;
  lead: string;
  compareLabel: string;
  brandLabel: string;
  bookLabel: string;
  detailsLabel: string;
  bookingOpen: boolean;
};

export function HomeFleetTeaser({
  items,
  eyebrow,
  titleBefore,
  titleAccent,
  titleAfter,
  lead,
  compareLabel,
  brandLabel,
  bookLabel,
  detailsLabel,
  bookingOpen,
}: Props) {
  const bookHref = (key: string) =>
    bookingOpen
      ? `/book?class=${encodeURIComponent(key)}`
      : `/request-a-transfer?class=${encodeURIComponent(key)}`;
  const [active, setActive] = useState(items[0]?.key ?? '');
  const cur = useMemo(() => items.find((i) => i.key === active) ?? items[0], [items, active]);
  if (!cur) return null;

  return (
    <section className="section home-fleet">
      <div className="wrap home-fleet-grid">
        <div className="home-fleet-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="display">
            {titleBefore}
            <em>{titleAccent}</em>
            {titleAfter}
          </h2>
          <p className="muted">{lead}</p>
          <ul className="home-fleet-tabs" role="tablist" aria-label={eyebrow}>
            {items.map((v) => (
              <li key={v.key} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={v.key === cur.key}
                  onClick={() => setActive(v.key)}
                >
                  <span>{v.name}</span>
                  {v.tagline ? <span className="home-fleet-tab-kind">{v.tagline}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <a className="link-arrow" href="/fleet">
            {compareLabel} →
          </a>
        </div>
        <div className="home-fleet-panel">
          {cur.photoUrl ? (
            <img src={cur.photoUrl} alt={cur.photoAlt || cur.name} loading="lazy" />
          ) : (
            <div className="media" aria-hidden="true" style={{ aspectRatio: '16 / 10' }} />
          )}
          <div className="home-fleet-panel-body">
            <p className="eyebrow">{brandLabel}</p>
            <h3 className="display accent">{cur.name}</h3>
            {cur.tagline ? <p className="muted">{cur.tagline}</p> : null}
            <div className="row">
              <a className="btn btn-gold" href={bookHref(cur.key)}>
                {bookLabel}
              </a>
              <a className="btn btn-line" href={`/fleet/${cur.key}`}>
                {detailsLabel}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
