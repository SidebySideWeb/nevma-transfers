import { useEffect, useState } from 'react';
import { BrandDropdown, type BrandDropdownProps } from '../BrandDropdown';

type Props = Omit<BrandDropdownProps, 'value' | 'onChange'> & {
  initial: string;
  /** URL query parameter that may preselect an option (e.g. `from`). */
  query?: string;
};

/** BrandDropdown with its own state, for static Astro forms. The hidden select posts `name`. */
export default function FormDropdown({ initial, query, ...rest }: Props) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (!query) return;
    const q = new URLSearchParams(window.location.search).get(query);
    if (q && rest.options.some((o) => o.value === q)) setValue(q);
  }, []); // once on mount
  return <BrandDropdown {...rest} value={value} onChange={setValue} />;
}
