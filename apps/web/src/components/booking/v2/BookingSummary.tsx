import type { Step } from '../types';

export type SummaryRow = { label: string; value: string };

/** Price analysis (VAT share): only drawn on the review step. All values are the server's. */
export type SummaryAnalysis = {
  title: string;
  net: SummaryRow;
  vat: SummaryRow;
  total: SummaryRow;
};

export type BookingSummaryProps = {
  step: Step;
  ariaLabel: string;
  vehicle: { eyebrow: string; name: string; photoUrl?: string | null };
  routeLabel: string;
  /** Second line is the drop-off, or "By the hour · 4 hours" (no arrow) for hourly hire. */
  route: { from: string; to: string; arrow?: boolean };
  rows: SummaryRow[];
  /** Price lines as the server returned them (or the quoted base price on steps 2 and 3). */
  lines: SummaryRow[];
  /** Steps 1 to 3: a single total, nothing else. */
  total?: SummaryRow;
  analysis?: SummaryAnalysis;
  notes?: string[];
  help: { label: string; phone: string; href: string };
};

/** Sticky aside of 08-book .. 08-book-4. Shows what it is given; it never computes a price. */
export function BookingSummary({
  step,
  ariaLabel,
  vehicle,
  routeLabel,
  route,
  rows,
  lines,
  total,
  analysis,
  notes = [],
  help,
}: BookingSummaryProps) {
  const showAnalysis = step === 'review' && analysis;
  const grand = showAnalysis ? analysis.total : total;
  return (
    <aside className="s18a95" aria-label={ariaLabel}>
      <div className="s2efcd">
        {vehicle.photoUrl ? <img className="sc22be" src={vehicle.photoUrl} alt="" /> : null}
        <div className="sec765" />
        <div className="sa574c">
          <div className="sfa746">{vehicle.eyebrow}</div>
          <div className="display s1beea">{vehicle.name}</div>
        </div>
      </div>
      <div className="s65cb7">
        <div className="s2a19b">
          <div className="s36738">{routeLabel.toUpperCase()}</div>
          <div>{route.from}</div>
          {route.arrow !== false ? <div className="sbbc0f">↓</div> : null}
          <div>{route.to}</div>
        </div>
        {rows.map((r) => (
          <div className="srow" key={r.label}>
            <span>{r.label}</span>
            <span>{r.value}</span>
          </div>
        ))}
        {lines.length > 0 || grand ? <div className="s5913c" /> : null}
        {lines.map((r, i) => (
          <div className="srow" key={`${r.label}-${i}`}>
            <span>{r.label}</span>
            <span>{r.value}</span>
          </div>
        ))}
        {showAnalysis ? (
          <>
            <div className="s36738" role="heading" aria-level={2}>
              {analysis.title.toUpperCase()}
            </div>
            <div className="srow">
              <span>{analysis.net.label}</span>
              <span data-testid="review-net">{analysis.net.value}</span>
            </div>
            <div className="srow">
              <span>{analysis.vat.label}</span>
              <span data-testid="review-vat">{analysis.vat.value}</span>
            </div>
          </>
        ) : null}
        {grand ? (
          <div className="s53354">
            <span className="s276eb">{grand.label}</span>
            <span className="s50d22" data-testid={showAnalysis ? 'review-total' : undefined}>
              {grand.value}
            </span>
          </div>
        ) : null}
        {notes.map((n) => (
          <div className="s6c19a" key={n}>
            {n}
          </div>
        ))}
        <div className="s6c19a">
          {help.label} <a href={help.href}>{help.phone}</a>
        </div>
      </div>
    </aside>
  );
}
