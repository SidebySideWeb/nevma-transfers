/** Search/select filters apply live; search is debounced 300 ms. Keep the query string via GET submit. */
function bindLiveFilters() {
  document.querySelectorAll<HTMLFormElement>('form.filters[data-live]').forEach((form) => {
    if (form.dataset.liveBound === '1') return;
    form.dataset.liveBound = '1';

    let timer: ReturnType<typeof setTimeout> | undefined;

    const submit = () => {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
    };

    form.addEventListener('change', (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      if (t.matches('input[type="search"], input[name="q"]')) return;
      submit();
    });

    form.querySelectorAll<HTMLInputElement>('input[type="search"], input[name="q"]').forEach((input) => {
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(submit, 300);
      });
    });
  });
}

function bindRowLinks() {
  document.querySelectorAll<HTMLTableRowElement>('tr.is-link[data-href]').forEach((tr) => {
    if (tr.dataset.linkBound === '1') return;
    tr.dataset.linkBound = '1';
    tr.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t?.closest('a, button, input, label, select, textarea, .ep-select')) return;
      const href = tr.dataset.href;
      if (href) window.location.href = href;
    });
    tr.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const t = ev.target as HTMLElement | null;
      if (t && t !== tr) return;
      ev.preventDefault();
      const href = tr.dataset.href;
      if (href) window.location.href = href;
    });
  });
}

bindLiveFilters();
bindRowLinks();
