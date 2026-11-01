import type { ReactNode } from 'react';

export interface VehicleCardProps {
  name: string;
  kind?: string;
  detail?: string;
  photoUrl?: string | null;
  photoAlt?: string;
  /** Formatted final price, or null when there is none. */
  price: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  disabled?: boolean;
}

/** Photo row for one vehicle class. */
export function VehicleCard({ name, kind, detail, photoUrl, photoAlt, price, status, action, disabled }: VehicleCardProps) {
  return (
    <article className="vehicle-card" aria-disabled={disabled || undefined}>
      <div
        className="vehicle-card-photo"
        role="img"
        aria-label={photoAlt ?? name}
        style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
      />
      <div className="vehicle-card-body">
        {kind && <p className="vehicle-card-kind">{kind}</p>}
        <h2 className="vehicle-card-name">{name}</h2>
        {detail && <p className="muted">{detail}</p>}
      </div>
      <div className="vehicle-card-side">
        <div className="vehicle-card-price">{price}</div>
        {status}
        {action}
      </div>
    </article>
  );
}
