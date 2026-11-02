const root = document.querySelector<HTMLElement>('[data-legal-hub]');
if (root) {
  const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-legal-toc]')];
  const secs = [...root.querySelectorAll<HTMLElement>('[data-legal-sec]')];
  const paint = () => {
    let current = secs[0]?.dataset.legalSec || '';
    const y = window.scrollY + 120;
    for (const s of secs) {
      if (s.offsetTop <= y) current = s.dataset.legalSec || current;
    }
    links.forEach((a) => {
      const on = a.dataset.legalToc === current;
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  };
  paint();
  window.addEventListener('scroll', paint, { passive: true });
}
