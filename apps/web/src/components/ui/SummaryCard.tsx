import type { ReactNode } from 'react';

export interface SummaryRow {
  label: string;
  value: ReactNode;
}

export interface SummaryCardProps {
  label: string;
  title: string;
  photoUrl?: string | null;
  /** Journey details (route, date, people). */
  rows: SummaryRow[];
  /** Price lines, exactly as the server returned them. */
  lines: SummaryRow[];
  total?: SummaryRow;
  note?: string;
}

/** Sticky booking summary. Shows what it is given; it never computes a price. */
export function SummaryCard({ label, title, photoUrl, rows, lines, total, note }: SummaryCardProps) {
  return (
    <section className="summary-card" aria-label={label}>
      <div className="summary-card-photo" style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}>
        <h2 className="summary-card-title">{title}</h2>
      </div>
      <div className="summary-card-body">
        <dl className="summary-card-rows">
          {rows.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        {lines.length > 0 && (
          <dl className="summary-card-rows summary-card-lines">
            {lines.map((r, i) => (
              <div key={`${r.label}-${i}`}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {total && (
          <p className="summary-card-total">
            <span>{total.label}</span>
            <span>{total.value}</span>
          </p>
        )}
        {note && <p className="summary-card-note">{note}</p>}
      </div>
    </section>
  );
}
