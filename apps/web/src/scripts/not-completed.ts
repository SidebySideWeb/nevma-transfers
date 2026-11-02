function formatRemain(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

const notCompletedRoot = document.getElementById('not-completed-root');
if (notCompletedRoot?.dataset.mode === 'live') {
  const expiresAt = Number(notCompletedRoot.dataset.expiresAtMs ?? '0');
  const timerEl = document.getElementById('hold-remain');
  const timerTemplate = notCompletedRoot.dataset.timerTemplate ?? '{time}';
  const reference = notCompletedRoot.dataset.reference ?? '';

  const tick = () => {
    const left = expiresAt - Date.now();
    if (left <= 0) {
      window.location.reload();
      return;
    }
    if (timerEl) {
      // Digits only: the "HELD FOR" label is beside the timer in the V2 card.
      timerEl.textContent = formatRemain(left);
      void timerTemplate;
    }
    window.setTimeout(tick, 1000);
  };
  tick();

  const tryAgain = document.getElementById('try-again');
  const handoff = document.getElementById('handoff');
  const handoffLink = document.getElementById('handoff-link') as HTMLAnchorElement | null;
  const livePanel = document.getElementById('live-panel');
  const errEl = document.getElementById('not-completed-error');

  tryAgain?.addEventListener('click', async () => {
    if (!(tryAgain instanceof HTMLButtonElement)) return;
    tryAgain.disabled = true;
    errEl?.setAttribute('hidden', '');
    try {
      const res = await fetch('/api/bookings/pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reference }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; message?: string };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.message || 'pay_failed');
      }
      livePanel?.setAttribute('hidden', '');
      handoff?.removeAttribute('hidden');
      if (handoffLink) handoffLink.href = data.checkoutUrl;
      document.getElementById('handoff-title')?.focus();
      window.setTimeout(() => {
        window.location.assign(data.checkoutUrl!);
      }, 600);
    } catch (e) {
      if (errEl) {
        errEl.textContent = e instanceof Error ? e.message : 'error';
        errEl.removeAttribute('hidden');
        errEl.focus();
      }
      tryAgain.disabled = false;
    }
  });

  document.getElementById('choose-vehicle')?.addEventListener('click', async (ev) => {
    ev.preventDefault();
    try {
      await fetch('/api/bookings/release', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reference }),
      });
    } catch {
      /* navigate anyway */
    }
    window.location.assign('/book#vehicle');
  });
}
