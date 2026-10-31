import { uiStringDefaults, type UiStringKey } from '@studio-strings';

export type { UiStringKey };

const defaultByKey: Record<UiStringKey, string> = Object.fromEntries(
  uiStringDefaults.map((entry) => [entry.key, entry.value]),
) as Record<UiStringKey, string>;

type StringOverrides = Partial<Record<UiStringKey, string>>;

let overrideCache: { values: StringOverrides; expiresAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/** Replace Sanity/ui string overrides (build-time or after a fetch). */
export function setStringOverrides(values: StringOverrides): void {
  overrideCache = { values, expiresAt: Date.now() + CACHE_MS };
}

export function clearStringOverrides(): void {
  overrideCache = null;
}

function activeOverrides(): StringOverrides {
  if (!overrideCache) return {};
  if (Date.now() > overrideCache.expiresAt) {
    overrideCache = null;
    return {};
  }
  return overrideCache.values;
}

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

function fillPlaceholders(
  template: string,
  vars: Record<string, string | number> | undefined,
  strictMissing: boolean,
): string {
  return template.replace(PLACEHOLDER, (match, name: string) => {
    if (vars && Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name]);
    }
    if (strictMissing) {
      throw new Error(`Missing placeholder variable: ${name}`);
    }
    return match;
  });
}

/**
 * Resolve a UI string: Sanity override if present, otherwise code default.
 * Placeholders `{name}` are filled from `vars`.
 */
export function t(key: UiStringKey, vars?: Record<string, string | number>): string {
  const overrides = activeOverrides();
  const template = overrides[key] ?? defaultByKey[key];
  const strictMissing = import.meta.env.MODE === 'test' || process.env.VITEST === 'true';
  return fillPlaceholders(template, vars, strictMissing);
}

/** Defaults only — used by tests and 500 page (no Sanity). */
export function tDefault(key: UiStringKey, vars?: Record<string, string | number>): string {
  const strictMissing = import.meta.env.MODE === 'test' || process.env.VITEST === 'true';
  return fillPlaceholders(defaultByKey[key], vars, strictMissing);
}
