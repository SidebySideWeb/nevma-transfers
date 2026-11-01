import { useEffect, useId, useRef, useState } from 'react';

export type BrandOption = { value: string; label: string };

export type BrandDropdownProps = {
  id: string;
  name?: string;
  label: string;
  options: BrandOption[];
  value: string;
  onChange: (value: string) => void;
  fieldClass?: string;
  required?: boolean;
  disabled?: boolean;
};

/** V2 brand dropdown: `dd-btn` + `ddl` listbox (08-book-1-open), hidden native select for no-JS. */
export function BrandDropdown({
  id,
  name,
  label,
  options,
  value,
  onChange,
  fieldClass = 'field s2f216',
  required,
  disabled,
}: BrandDropdownProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const reactId = useId();
  const listId = `${id}-list-${reactId}`;
  const labelId = `${id}-label-${reactId}`;
  const valueId = `${id}-value-${reactId}`;
  const selected = options.findIndex((o) => o.value === value);
  const labelText = options[selected]?.label ?? '';
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
    document.getElementById(id)?.focus();
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
    else if (e.key === 'Escape') {
      setOpen(false);
      document.getElementById(id)?.focus();
    } else if (e.key === 'Tab') {
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

  return (
    <div className={fieldClass} ref={root}>
      <label id={labelId} htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        className="dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-activedescendant={open ? optId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <span id={valueId}>{labelText}</span>
        <span className="sbebe0" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <ul role="listbox" id={listId} className="ddl" tabIndex={-1} onMouseDown={(e) => e.preventDefault()}>
          {options.map((o, i) => (
            <li key={o.value} role="presentation">
              <button
                type="button"
                role="option"
                id={optId(i)}
                className="dd-opt"
                aria-selected={i === selected}
                onClick={() => pick(i)}
              >
                <span className="sb5725" aria-hidden="true">
                  {i === selected ? '✓' : ''}
                </span>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <select
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        hidden
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
