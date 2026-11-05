/** Demo (`is_demo`) or offline (`active === false` / vehicle `status !== 'active'`). */
export function isDemoOrOffline(row: {
  is_demo?: boolean | null;
  active?: boolean | null;
  status?: string | null;
}): boolean {
  if (row.is_demo) return true;
  if (row.active === false) return true;
  if (row.status != null && row.status !== 'active') return true;
  return false;
}

/** Keep primary rows first (stable), append demo/offline last (stable). */
export function withDemoOfflineLast<T>(
  rows: readonly T[],
  isHidden: (row: T) => boolean = (row) => isDemoOrOffline(row as never),
): { rows: T[]; hiddenCount: number } {
  const primary: T[] = [];
  const hidden: T[] = [];
  for (const row of rows) {
    (isHidden(row) ? hidden : primary).push(row);
  }
  return { rows: [...primary, ...hidden], hiddenCount: hidden.length };
}
