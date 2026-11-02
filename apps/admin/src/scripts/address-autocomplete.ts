/**
 * Admin office new-booking address suggestions (docs/ADDRESS-AUTOCOMPLETE.md).
 * Reuses the ep-select list look; calls /api/places/* behind the staff session.
 */

type Suggestion = { placeId: string; label: string; main: string; secondary: string };

const DEBOUNCE_MS = 300;

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type PlaceValue = { placeId: string; lat: number; lng: number } | null;

export function enhanceAddressField(
  input: HTMLInputElement,
  opts: { enabled: boolean; onPlace: (p: PlaceValue) => void },
): void {
  if (!opts.enabled || input.dataset.epAddress === '1') return;
  input.dataset.epAddress = '1';

  const wrap = document.createElement('div');
  wrap.className = 'ep-address';
  input.parentElement?.insertBefore(wrap, input);
  wrap.appendChild(input);

  const list = document.createElement('ul');
  list.className = 'ep-select-list ep-address-list';
  list.hidden = true;
  list.setAttribute('role', 'listbox');
  wrap.appendChild(list);

  const attr = document.createElement('div');
  attr.className = 'ep-address-attr muted small';
  attr.hidden = true;
  attr.innerHTML = '<img src="/google-maps-on-non-white.svg" alt="Google Maps" width="66" height="18" />';
  wrap.appendChild(attr);

  let session = crypto.randomUUID();
  let items: Suggestion[] = [];
  let active = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let picking = false;

  const close = () => {
    list.hidden = true;
    attr.hidden = true;
    wrap.classList.remove('is-open');
    input.removeAttribute('aria-activedescendant');
    input.setAttribute('aria-expanded', 'false');
  };

  const render = () => {
    list.replaceChildren();
    items.forEach((s, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = `${input.id}-opt-${i}`;
      li.setAttribute('aria-selected', i === active ? 'true' : 'false');
      if (i === active) li.classList.add('is-active');
      li.innerHTML = `<span class="ep-address-main">${escape(s.main)}</span>${
        s.secondary ? `<span class="ep-address-sec muted small">${escape(s.secondary)}</span>` : ''
      }`;
      li.addEventListener('mousedown', (e) => e.preventDefault());
      li.addEventListener('click', () => void pick(s));
      list.appendChild(li);
    });
    list.hidden = items.length === 0;
    attr.hidden = items.length === 0;
    wrap.classList.toggle('is-open', items.length > 0);
    input.setAttribute('aria-expanded', items.length > 0 ? 'true' : 'false');
    if (items.length) input.setAttribute('aria-activedescendant', `${input.id}-opt-${active}`);
  };

  const pick = async (s: Suggestion) => {
    picking = true;
    close();
    const details = await postJson<{ placeId: string; address: string; lat: number; lng: number }>(
      '/api/places/details',
      { placeId: s.placeId, sessionToken: session },
    );
    session = crypto.randomUUID();
    if (!details) {
      input.value = s.label;
      opts.onPlace(null);
      picking = false;
      return;
    }
    input.value = s.label || details.address;
    opts.onPlace({ placeId: details.placeId, lat: details.lat, lng: details.lng });
    picking = false;
  };

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id || (list.id = `${input.id}-list`));

  input.addEventListener('input', () => {
    if (picking) return;
    opts.onPlace(null);
    if (timer) clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) {
      items = [];
      close();
      return;
    }
    timer = setTimeout(async () => {
      const data = await postJson<{ suggestions: Suggestion[] }>('/api/places/autocomplete', {
        input: q,
        sessionToken: session,
      });
      items = data?.suggestions ?? [];
      active = 0;
      render();
    }, DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (e) => {
    if (list.hidden || !items.length) {
      if (e.key === 'Escape') close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(items.length - 1, active + 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void pick(items[active]!);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) close();
  });
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
