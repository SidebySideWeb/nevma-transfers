import type { ReactNode } from 'react';

export interface InvoiceBlockProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  toggleLabel: string;
  children: ReactNode;
}

/** Invoice request toggle; the fields (children) show only while it is on. */
export function InvoiceBlock({ id, checked, onChange, toggleLabel, children }: InvoiceBlockProps) {
  return (
    <div className="invoice-block">
      <label className="check" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} aria-expanded={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{toggleLabel}</span>
      </label>
      {checked && <div className="invoice-fields grid grid-2">{children}</div>}
    </div>
  );
}
