export type DeployHookFetch = (url: string, init?: RequestInit) => Promise<Response>;

let deployFetch: DeployHookFetch = (...args) => fetch(...args);

/** Test hook: replace fetch used for TEM_WEB_DEPLOY_HOOK_URL. */
export function setDeployHookFetch(fn: DeployHookFetch | null): void {
  deployFetch = fn ?? ((...args) => fetch(...args));
}

export async function callWebsiteDeployHook(): Promise<{ ok: true } | { ok: false; message: string }> {
  const url =
    import.meta.env.TEM_WEB_DEPLOY_HOOK_URL || process.env.TEM_WEB_DEPLOY_HOOK_URL || '';
  if (!url) {
    return { ok: false, message: 'TEM_WEB_DEPLOY_HOOK_URL is not configured.' };
  }
  try {
    const res = await deployFetch(url, { method: 'POST' });
    if (!res.ok) {
      return { ok: false, message: `Deploy hook returned HTTP ${res.status}.` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Deploy hook request failed.' };
  }
}
