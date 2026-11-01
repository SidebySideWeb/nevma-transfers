import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { UiStringKey } from '../strings';

function seedPath(): string | null {
  const candidates = [
    join(process.cwd(), 'seed/sanity/data.ndjson'),
    join(process.cwd(), '../../seed/sanity/data.ndjson'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** uiStrings from the V2 seed — used until `import:v2` updates the live dataset. */
export function seedUiStringOverrides(): Partial<Record<UiStringKey, string>> {
  const file = seedPath();
  if (!file) return {};
  const overrides: Partial<Record<UiStringKey, string>> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"uiStrings"')) continue;
    try {
      const doc = JSON.parse(line) as {
        _type?: string;
        strings?: { key?: string; value?: string }[];
      };
      if (doc._type !== 'uiStrings') continue;
      for (const row of doc.strings ?? []) {
        if (row?.key && typeof row.value === 'string') {
          overrides[row.key as UiStringKey] = row.value;
        }
      }
      break;
    } catch {
      /* skip bad line */
    }
  }
  return overrides;
}
