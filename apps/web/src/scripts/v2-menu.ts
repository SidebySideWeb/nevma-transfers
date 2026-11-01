export function setupV2Menu(): void {
  const openBtn = document.querySelector<HTMLButtonElement>('.js-menu-open');
  const tplEl = document.getElementById('v2-menu-template');
  if (!openBtn || !(tplEl instanceof HTMLTemplateElement)) return;
  const tpl = tplEl;

  let panel: HTMLElement | null = null;
  let lastFocus: HTMLElement | null = null;

  const btn = openBtn;

  function placePanel(node: HTMLElement) {
    const header = btn.closest('header');
    if (header) header.insertAdjacentElement('afterend', node);
    else btn.insertAdjacentElement('afterend', node);
  }

  function open() {
    if (panel) return;
    lastFocus = document.activeElement as HTMLElement | null;
    const first = tpl.content.firstElementChild;
    if (!first) return;
    panel = first.cloneNode(true) as HTMLElement;
    placePanel(panel);
    btn.setAttribute('aria-expanded', 'true');
    if (document.body.classList.contains('pg-01-home')) {
      document.body.classList.replace('pg-01-home', 'pg-01-home-navopen');
    }
    panel.querySelector<HTMLElement>('.js-menu-close, a')?.focus();
    panel.querySelector('.js-menu-close')?.addEventListener('click', close);
    panel.querySelectorAll('.js-menu-link').forEach((a) => a.addEventListener('click', close));
  }

  function close() {
    panel?.remove();
    panel = null;
    btn.setAttribute('aria-expanded', 'false');
    if (document.body.classList.contains('pg-01-home-navopen')) {
      document.body.classList.replace('pg-01-home-navopen', 'pg-01-home');
    }
    (lastFocus || btn).focus();
  }

  btn.addEventListener('click', () => (panel ? close() : open()));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel) {
      e.preventDefault();
      close();
    }
  });
}

setupV2Menu();
document.addEventListener('astro:page-load', setupV2Menu);
