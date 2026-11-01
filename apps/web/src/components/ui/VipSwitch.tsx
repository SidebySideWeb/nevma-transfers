export interface VipSwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  hint?: string;
  price?: string;
  disabled?: boolean;
}

/** Add-on toggle. Stays a native checkbox (name, state and keys for free); CSS draws the switch. */
export function VipSwitch({ id, checked, onChange, title, hint, price, disabled }: VipSwitchProps) {
  const hintId = `${id}-hint`;
  return (
    <label className={`vip-switch${checked ? ' is-on' : ''}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="vip-switch-input"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="vip-switch-text">
        <strong>{title}</strong>
        {hint && (
          <span className="muted" id={hintId}>
            {hint}
          </span>
        )}
      </span>
      {price && <span className="vip-switch-price">{price}</span>}
      <span className="vip-switch-track" aria-hidden="true" />
    </label>
  );
}
