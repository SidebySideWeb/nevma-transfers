export {};

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          size?: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
        },
      ) => string;
      execute: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
    __TEM_TURNSTILE_TOKEN__?: string;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile_load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Cloudflare always-pass test sitekey — no widget / challenge platform needed. */
const TURNSTILE_TEST_PASS_SITEKEY = '1x0000000000000000000000000000000AA';

/** Obtain a Turnstile token. Tests may set `window.__TEM_TURNSTILE_TOKEN__`. */
export async function getTurnstileToken(siteKey: string): Promise<string> {
  if (typeof window !== 'undefined' && window.__TEM_TURNSTILE_TOKEN__) {
    return window.__TEM_TURNSTILE_TOKEN__;
  }
  // Demo / CI: skip challenges.cloudflare.com when using the official dummy sitekey.
  // Server `verifyTurnstile` already accepts any token for the matching dummy secret.
  if (!siteKey || siteKey === TURNSTILE_TEST_PASS_SITEKEY) {
    return 'XXXX.DUMMY.TOKEN.XXXX';
  }
  await loadScript();
  if (!window.turnstile) throw new Error('turnstile_missing');

  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-9999px';
    document.body.appendChild(host);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      try {
        window.turnstile?.remove(id);
      } catch {
        /* ignore */
      }
      host.remove();
    };
    const ts = window.turnstile;
    if (!ts) {
      reject(new Error('turnstile_missing'));
      return;
    }
    const id = ts.render(host, {
      sitekey: siteKey,
      size: 'invisible',
      callback: (token) => finish(() => resolve(token)),
      'error-callback': () => finish(() => reject(new Error('turnstile_failed'))),
    });
    ts.execute(id);
    setTimeout(() => finish(() => reject(new Error('turnstile_timeout'))), 20_000);
  });
}
