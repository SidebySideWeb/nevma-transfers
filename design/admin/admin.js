/* Elite Protection Admin — behaviour for the design boards (and a reference for apps/admin islands).
   1. Brand dropdown: every <select class="input"> becomes a select-only combobox (WAI-ARIA APG pattern).
      The native <select> stays in the form (hidden) so posts and Astro actions keep working.
   2. Customer lookup: <input data-lookup> with a listbox of matches.
   3. Mobile nav toggle. */
(() => {
  let uid = 0;
  const id = (p) => `${p}-${++uid}`;

  function enhanceSelect(sel) {
    if (sel.dataset.native !== undefined || sel.multiple) return;
    const wrap = document.createElement('div');
    wrap.className = 'ep-select';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ep-select-btn input';
    btn.id = id('cb');
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const list = document.createElement('ul');
    list.className = 'ep-select-list';
    list.id = id('lb');
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    btn.setAttribute('aria-controls', list.id);
    const label = sel.id && document.querySelector(`label[for="${sel.id}"]`);
    if (label) { label.id = label.id || id('lab'); label.htmlFor = btn.id; list.setAttribute('aria-labelledby', label.id); }
    else if (sel.getAttribute('aria-label')) { btn.setAttribute('aria-label', sel.getAttribute('aria-label')); list.setAttribute('aria-label', sel.getAttribute('aria-label')); }
    ['aria-describedby', 'aria-invalid'].forEach((a) => sel.hasAttribute(a) && btn.setAttribute(a, sel.getAttribute(a)));
    if (sel.disabled) btn.disabled = true;

    const opts = [...sel.options].map((o, i) => {
      const li = document.createElement('li');
      li.id = id('op');
      li.setAttribute('role', 'option');
      li.dataset.index = i;
      const meta = o.dataset.meta ? `<span class="ep-opt-meta">${o.dataset.meta}</span>` : '';
      li.innerHTML = `<span class="ep-opt-text"></span>${meta}`;
      li.querySelector('.ep-opt-text').textContent = o.textContent;
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      list.appendChild(li);
      return li;
    });
    let active = sel.selectedIndex;
    const render = () => {
      btn.textContent = sel.options[sel.selectedIndex]?.textContent ?? '';
      opts.forEach((li, i) => {
        li.setAttribute('aria-selected', String(i === sel.selectedIndex));
        li.classList.toggle('is-active', i === active);
      });
      if (opts[active]) btn.setAttribute('aria-activedescendant', opts[active].id);
    };
    const open = () => {
      if (btn.disabled) return;
      active = sel.selectedIndex;
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      render();
      opts[active]?.scrollIntoView({ block: 'nearest' });
    };
    const close = () => { wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); btn.removeAttribute('aria-activedescendant'); };
    const pick = (i) => {
      if (opts[i]?.getAttribute('aria-disabled') === 'true') return;
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      close(); render(); btn.focus();
    };
    const move = (to) => {
      const n = opts.length;
      let i = Math.max(0, Math.min(n - 1, to));
      active = i; render(); opts[i]?.scrollIntoView({ block: 'nearest' });
    };
    let typed = '', typedAt = 0;
    btn.addEventListener('click', () => (wrap.classList.contains('is-open') ? close() : open()));
    btn.addEventListener('keydown', (e) => {
      const isOpen = wrap.classList.contains('is-open');
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) && !isOpen) { e.preventDefault(); open(); return; }
      if (!isOpen) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); move(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); move(0); }
      else if (e.key === 'End') { e.preventDefault(); move(opts.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') { close(); }
      else if (e.key.length === 1) {
        const now = Date.now(); typed = now - typedAt > 600 ? e.key.toLowerCase() : typed + e.key.toLowerCase(); typedAt = now;
        const i = [...sel.options].findIndex((o) => o.textContent.toLowerCase().startsWith(typed));
        if (i >= 0) move(i);
      }
    });
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => { const li = e.target.closest('[role="option"]'); if (li) pick(Number(li.dataset.index)); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });

    sel.classList.add('ep-select-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.append(btn, list, sel);
    render();
  }

  function enhanceLookup(input) {
    const list = document.getElementById(input.getAttribute('aria-controls'));
    if (!list) return;
    const items = [...list.querySelectorAll('[role="option"]')];
    let active = -1;
    const show = (yes) => { list.hidden = !yes; input.setAttribute('aria-expanded', String(yes)); };
    const mark = () => items.forEach((li, i) => { li.classList.toggle('is-active', i === active); if (i === active) input.setAttribute('aria-activedescendant', li.id); });
    input.addEventListener('input', () => { active = -1; show(input.value.trim().length > 1); });
    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); items[active].click(); }
      else if (e.key === 'Escape') show(false);
    });
    items.forEach((li) => li.addEventListener('click', () => { input.value = li.dataset.value || li.textContent.trim(); show(false); }));
    input.addEventListener('blur', () => setTimeout(() => show(false), 120));
    if (input.dataset.open !== undefined) show(true);
  }

  function navToggle() {
    const b = document.querySelector('.menu-btn');
    const n = document.getElementById('adminnav');
    if (!b || !n) return;
    b.addEventListener('click', () => { const o = n.classList.toggle('open'); b.setAttribute('aria-expanded', String(o)); });
  }

  document.querySelectorAll('select.input').forEach(enhanceSelect);
  document.querySelectorAll('input[data-lookup]').forEach(enhanceLookup);
  navToggle();
})();
