/** Open/close `<dialog class="dialog">` via data-open / data-close. Native showModal traps focus and Esc. */

function openDialog(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLDialogElement)) return;
  if (typeof el.showModal === 'function' && !el.open) el.showModal();
  else el.setAttribute('open', '');
  const focusable = el.querySelector<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  focusable?.focus();
}

function closeDialog(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLDialogElement)) return;
  if (typeof el.close === 'function') el.close();
  else el.removeAttribute('open');
}

document.querySelectorAll<HTMLElement>('[data-open]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-open');
    if (id) openDialog(id);
  });
});

document.querySelectorAll<HTMLElement>('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-close');
    if (id) closeDialog(id);
  });
});

document.querySelectorAll<HTMLDialogElement>('dialog.dialog').forEach((dlg) => {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
});
