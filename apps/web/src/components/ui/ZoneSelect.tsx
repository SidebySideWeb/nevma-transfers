import { useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface ZoneSelectProps {
  id: string;
  name?: string;
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  describedBy?: string;
  swapWith?: { otherValue: string; onSwap: () => void };
  swapLabel?: string;
}

/** Select-only combobox (WAI-ARIA APG), mirrors apps/admin enhance-select. Native select stays in the DOM for no-JS. */
export function ZoneSelect({
  id,
  name,
  label,
  options,
  value,
  onChange,
  required,
  disabled,
  error,
  describedBy,
  swapWith,
  swapLabel = 'Swap pick-up and drop-off',
}: ZoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const selected = options.findIndex((o) => o.value === value);
  const btnId = `${id}-btn`;
  const listId = `${id}-list`;
  const errId = `${id}-err`;
  const optId = (i: number) => `${id}-opt-${i}`;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', away);
    return () => document.removeEventListener('click', away);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  const show = () => {
    if (disabled) return;
    setActive(selected < 0 ? 0 : selected);
    setOpen(true);
  };
  const pick = (i: number) => {
    if (options[i]) onChange(options[i].value);
    setOpen(false);
    document.getElementById(btnId)?.focus();
  };
  const move = (i: number) => setActive(Math.max(0, Math.min(options.length - 1, i)));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'ArrowDown') move(active + 1);
    else if (e.key === 'ArrowUp') move(active - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') pick(active);
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Tab') {
      setOpen(false);
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = Date.now();
      const t = typed.current;
      t.text = now - t.at > 600 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
      t.at = now;
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(t.text));
      if (i >= 0) move(i);
      return;
    } else return;
    e.preventDefault();
  };

  const describedIds = [error ? errId : '', describedBy ?? ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={btnId}>{label}</label>
      <div className="zone-select-row">
        <div className={`zone-select${open ? ' is-open' : ''}`} ref={root}>
          <button
            type="button"
            id={btnId}
            className="zone-select-btn input"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open ? optId(active) : undefined}
            aria-describedby={describedIds}
            aria-invalid={error ? true : undefined}
            aria-required={required || undefined}
            disabled={disabled}
            onClick={() => (open ? setOpen(false) : show())}
            onKeyDown={onKeyDown}
          >
            {options[selected]?.label ?? ''}
          </button>
          <ul
            id={listId}
            className="zone-select-list"
            role="listbox"
            aria-labelledby={btnId}
            tabIndex={-1}
            hidden={!open}
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={optId(i)}
                role="option"
                aria-selected={i === selected}
                className={`zone-select-opt${i === active ? ' is-active' : ''}`}
                onClick={() => pick(i)}
              >
                {o.label}
              </li>
            ))}
          </ul>
          <select
            id={id}
            name={name}
            className="sr-only"
            value={value}
            required={required}
            disabled={disabled}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => onChange(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {swapWith && (
          <button
            type="button"
            className="swap-btn"
            aria-label={swapLabel}
            disabled={disabled || (!value && !swapWith.otherValue)}
            onClick={swapWith.onSwap}
          >
            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
            </svg>
          </button>
        )}
      </div>
      {error && (
        <p id={errId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
