/** Brand dropdown: mirrors design/admin/admin.js enhanceSelect (WAI-ARIA APG combobox). */

let uid = 0;
const nextId = (p: string) => `${p}-${++uid}`;

/** Reset id counter (tests). */
export function resetSelectIds(): void {
  uid = 0;
}

export function enhanceSelect(sel: HTMLSelectElement, doc: Document = document): void {
  if (sel.dataset.enhanced === '1' || sel.multiple) return;
  sel.dataset.enhanced = '1';

  const wrap = doc.createElement('div');
  wrap.className = 'ep-select';
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = `ep-select-btn input${sel.classList.contains('input-sm') ? ' input-sm' : ''}`;
  btn.id = nextId('cb');
  btn.setAttribute('role', 'combobox');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const list = doc.createElement('ul');
  list.className = 'ep-select-list';
  list.id = nextId('lb');
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  btn.setAttribute('aria-controls', list.id);

  const label = sel.id ? (doc.querySelector(`label[for="${sel.id}"]`) as HTMLLabelElement | null) : null;
  if (label) {
    label.id = label.id || nextId('lab');
    label.htmlFor = btn.id;
    list.setAttribute('aria-labelledby', label.id);
  } else if (sel.getAttribute('aria-label')) {
    const a = sel.getAttribute('aria-label')!;
    btn.setAttribute('aria-label', a);
    list.setAttribute('aria-label', a);
  }
  for (const a of ['aria-describedby', 'aria-invalid'] as const) {
    if (sel.hasAttribute(a)) btn.setAttribute(a, sel.getAttribute(a)!);
  }
  if (sel.disabled) btn.disabled = true;

  const opts = [...sel.options].map((o, i) => {
    const li = doc.createElement('li');
    li.id = nextId('op');
    li.setAttribute('role', 'option');
    li.dataset.index = String(i);
    const text = doc.createElement('span');
    text.className = 'ep-opt-text';
    text.textContent = o.textContent;
    li.appendChild(text);
    if (o.dataset.meta) {
      const meta = doc.createElement('span');
      meta.className = 'ep-opt-meta';
      meta.textContent = o.dataset.meta;
      li.appendChild(meta);
    }
    if (o.disabled) li.setAttribute('aria-disabled', 'true');
    list.appendChild(li);
    return li;
  });

  let active = sel.selectedIndex < 0 ? 0 : sel.selectedIndex;

  const render = () => {
    btn.textContent = sel.options[sel.selectedIndex]?.textContent ?? '';
    opts.forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === sel.selectedIndex));
      li.classList.toggle('is-active', i === active);
    });
    if (opts[active]) btn.setAttribute('aria-activedescendant', opts[active]!.id);
  };

  const open = () => {
    if (btn.disabled) return;
    active = sel.selectedIndex < 0 ? 0 : sel.selectedIndex;
    wrap.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    render();
    opts[active]?.scrollIntoView?.({ block: 'nearest' });
  };

  const close = () => {
    wrap.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-activedescendant');
  };

  const pick = (i: number) => {
    if (opts[i]?.getAttribute('aria-disabled') === 'true') return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    close();
    render();
    btn.focus();
  };

  const move = (to: number) => {
    const n = opts.length;
    const i = Math.max(0, Math.min(n - 1, to));
    active = i;
    render();
    opts[i]?.scrollIntoView?.({ block: 'nearest' });
  };

  let typed = '';
  let typedAt = 0;

  btn.addEventListener('click', () => (wrap.classList.contains('is-open') ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    const isOpen = wrap.classList.contains('is-open');
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) && !isOpen) {
      e.preventDefault();
      open();
      return;
    }
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(active - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      move(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(opts.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close();
    } else if (e.key.length === 1) {
      const now = Date.now();
      typed = now - typedAt > 600 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
      typedAt = now;
      const i = [...sel.options].findIndex((o) => o.textContent.toLowerCase().startsWith(typed));
      if (i >= 0) move(i);
    }
  });
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('[role="option"]') as HTMLElement | null;
    if (li) pick(Number(li.dataset.index));
  });
  doc.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) close();
  });

  sel.classList.add('ep-select-native', 'input');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  sel.parentNode!.insertBefore(wrap, sel);
  wrap.append(btn, list, sel);
  render();
}

/**
 * Rebuild the brand dropdown after the native options changed (e.g. class list for a new time).
 * ponytail: each rebuild adds one document click listener; fine for a handful of rebuilds per page.
 */
export function refreshSelect(sel: HTMLSelectElement, doc: Document = document): void {
  const wrap = sel.closest('.ep-select');
  if (wrap) {
    const btn = wrap.querySelector<HTMLButtonElement>('.ep-select-btn');
    const label = btn?.id ? doc.querySelector<HTMLLabelElement>(`label[for="${btn.id}"]`) : null;
    if (label && sel.id) label.htmlFor = sel.id;
    wrap.replaceWith(sel);
    sel.classList.remove('ep-select-native');
    sel.removeAttribute('tabindex');
    sel.removeAttribute('aria-hidden');
    delete sel.dataset.enhanced;
  }
  enhanceSelect(sel, doc);
}

export function enhanceAllSelects(root: ParentNode = document, doc: Document = document): void {
  root.querySelectorAll<HTMLSelectElement>('select.input').forEach((sel) => enhanceSelect(sel, doc));
}
