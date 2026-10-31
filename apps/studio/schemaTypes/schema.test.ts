import { describe, expect, it } from 'vitest';
import { schemaTypes } from './index';
import { validateVehicleKey } from './lib/vehicleKey';
import { filterNewDocumentOptions, singletonTypes } from '../structure';

type AnyDef = Record<string, any>;

// Records which validation rules a field asks for.
function recordRules(validation: unknown): string[] {
  const calls: string[] = [];
  const rule: any = new Proxy(function () {}, {
    get: (_t, prop: string) => {
      if (prop === 'then') return undefined;
      calls.push(prop);
      return () => rule;
    },
  });
  if (typeof validation === 'function') (validation as (r: unknown) => unknown)(rule);
  return calls;
}

function collectImages(def: AnyDef, out: AnyDef[] = []): AnyDef[] {
  if (!def || typeof def !== 'object') return out;
  if (def.type === 'image') out.push(def);
  for (const f of def.fields ?? []) collectImages(f, out);
  for (const o of def.of ?? []) collectImages(o, out);
  return out;
}

describe('studio schema', () => {
  const names = schemaTypes.map((t: AnyDef) => t.name);

  it('registers every kit 1 content type', () => {
    for (const n of ['siteSettings', 'uiStrings', 'vehicleClass', 'page', 'seo', 'hero', 'richText', 'ctaBand', 'faq']) {
      expect(names).toContain(n);
    }
  });

  it('does not model operational data (zones, prices, bookings) in Sanity', () => {
    for (const n of ['zone', 'price', 'booking', 'extra', 'vehicle', 'payment']) {
      expect(names).not.toContain(n);
    }
  });

  it('validateVehicleKey accepts lowercase slugs and rejects others', () => {
    expect(validateVehicleKey('v-class')).toBe(true);
    expect(validateVehicleKey('demo-sedan')).toBe(true);
    expect(validateVehicleKey('V-Class')).not.toBe(true);
    expect(validateVehicleKey('v class')).not.toBe(true);
    expect(validateVehicleKey('')).not.toBe(true);
    expect(validateVehicleKey(undefined)).not.toBe(true);
    expect(validateVehicleKey('-v')).not.toBe(true);
  });

  it('every image field has a required alt text field', () => {
    const images = schemaTypes.flatMap((t: AnyDef) => collectImages(t));
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      const alt = (img.fields ?? []).find((f: AnyDef) => f.name === 'alt');
      expect(alt, 'image without alt field').toBeTruthy();
      expect(recordRules(alt.validation)).toContain('required');
    }
  });

  it('singletons cannot be created a second time', () => {
    expect([...singletonTypes].sort()).toEqual(['siteSettings', 'uiStrings']);
    const prev = [
      { templateId: 'siteSettings' },
      { templateId: 'uiStrings' },
      { templateId: 'vehicleClass' },
      { templateId: 'page' },
    ];
    const next = filterNewDocumentOptions(prev as any, { creationContext: { type: 'global' } } as any);
    expect(next.map((o: AnyDef) => o.templateId)).toEqual(['vehicleClass', 'page']);
  });

  it('page kind is limited to home and legal', () => {
    const page = schemaTypes.find((t: AnyDef) => t.name === 'page') as AnyDef;
    const kind = page.fields.find((f: AnyDef) => f.name === 'kind');
    expect(kind.options.list.map((o: AnyDef) => o.value).sort()).toEqual(['home', 'legal']);
  });
});
