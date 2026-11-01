import { v2SectionNames } from './sections/v2Sections';
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { schemaTypes } from './index';
import { uiStringDefaults } from './lib/uiStringDefaults';

type AnyDef = Record<string, any>;
const seedDir = join(__dirname, '..', '..', '..', 'seed', 'sanity');
const docs: AnyDef[] = readFileSync(join(seedDir, 'data.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const byName = Object.fromEntries(schemaTypes.map((t: AnyDef) => [t.name, t]));

function requires(field: AnyDef): boolean {
  let req = false;
  const rule: any = new Proxy(function () {}, {
    get: (_t, prop: string) => {
      if (prop === 'then') return undefined;
      if (prop === 'required') req = true;
      return () => rule;
    },
  });
  if (typeof field.validation === 'function') field.validation(rule);
  return req;
}

function fieldsOf(typeName: string): AnyDef[] {
  return byName[typeName]?.fields ?? [];
}

describe('Sanity DEMO seed', () => {
  it('has unique ids without dots (dots make documents private)', () => {
    const ids = docs.map((d) => d._id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).not.toContain('.');
  });

  it('only uses document types and top-level fields that exist in the schema', () => {
    for (const d of docs) {
      expect(byName[d._type], d._id).toBeTruthy();
      const allowed = new Set(fieldsOf(d._type).map((f) => f.name));
      for (const k of Object.keys(d)) if (!k.startsWith('_')) expect(allowed.has(k), `${d._id}.${k}`).toBe(true);
    }
  });

  it('fills every required top-level field', () => {
    for (const d of docs) {
      for (const f of fieldsOf(d._type)) if (requires(f)) expect(d[f.name], `${d._id}.${f.name}`).toBeTruthy();
    }
  });

  it('page sections use known section types with their required fields', () => {
    for (const d of docs.filter((x) => x._type === 'page')) {
      for (const s of d.sections ?? []) {
        expect(v2SectionNames).toContain(s._type);
        expect(s._key).toBeTruthy();
        for (const f of fieldsOf(s._type)) if (requires(f)) expect(s[f.name], `${d._id} ${s._type}.${f.name}`).toBeTruthy();
      }
    }
  });

  it('every image has alt text and its file exists', () => {
    const images: AnyDef[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        const o = v as AnyDef;
        if (typeof o._sanityAsset === 'string') images.push(o);
        Object.values(o).forEach(walk);
      }
    };
    docs.forEach(walk);
    expect(images.length).toBeGreaterThanOrEqual(14);
    for (const img of images) {
      expect(img.alt).toBeTruthy();
      const file = img._sanityAsset.replace('image@file://./', '');
      expect(existsSync(join(seedDir, file)), file).toBe(true);
    }
  });

  it('uiStrings covers every default key exactly once', () => {
    const ui = docs.find((d) => d._id === 'uiStrings')!;
    const keys = ui.strings.map((s: AnyDef) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(uiStringDefaults.map((d) => d.key).sort());
  });

  it('marks every document as DEMO so the launch check catches leftovers', () => {
    for (const d of docs) expect(d.internalNote, d._id).toMatch(/DEMO/);
  });

  it('has the home page, four legal pages, the legal hub, six standard pages and the vehicle template', () => {
    const slugs = docs.filter((d) => d._type === 'page').map((d) => d.slug.current).sort();
    expect(slugs).toEqual(['about', 'cancellation', 'contact', 'cookies', 'fleet', 'home', 'legal', 'privacy', 'request-a-transfer', 'services', 'terms', 'vehicle', 'vip-security']);
  });

  it('every reference points to a seeded document of the right type', () => {
    const byId = Object.fromEntries(docs.map((d) => [d._id, d]));
    const refs: AnyDef[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') { const o = v as AnyDef; if (o._type === 'reference') refs.push(o); Object.values(o).forEach(walk); }
    };
    docs.forEach(walk);
    expect(refs.length).toBe(4); // three forms and the featured route
    for (const r of refs.filter((x) => x._ref.startsWith('route-'))) expect(byId[r._ref]?._type, r._ref).toBe('route');
    for (const r of refs.filter((x) => !x._ref.startsWith('route-'))) expect(byId[r._ref]?._type, r._ref).toBe('form');
  });

  it('has the three forms with recipients, and contact topics with unique keys', () => {
    const forms = docs.filter((d) => d._type === 'form');
    expect(forms.map((f) => f.key).sort()).toEqual(['contact', 'transfer-request', 'vip-security']);
    for (const f of forms) expect(f.recipientEmail).toMatch(/@/);
    const topics = forms.find((f) => f.key === 'contact')!.topics.map((t: AnyDef) => t.key);
    expect(new Set(topics).size).toBe(topics.length);
  });

  it('routes have unique slugs and two different zone codes', () => {
    const routes = docs.filter((d) => d._type === 'route');
    expect(routes.length).toBeGreaterThanOrEqual(4);
    const slugs = routes.map((r) => r.slug.current);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const r of routes) { expect(r.fromZone).not.toBe(r.toZone); expect(r.fromZone).toMatch(/^demo-/); }
  });

  it('contains no submissions (they are created by the site only)', () => {
    expect(docs.filter((d) => d._type === 'formSubmission')).toHaveLength(0);
  });
});
