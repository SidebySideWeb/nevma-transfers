import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

type OpenApiDoc = {
  components: { schemas: Record<string, Json> };
};

let ajv: Ajv2020 | null = null;

function rewriteRefs(node: Json): Json {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node && typeof node === 'object') {
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string' && v.startsWith('#/components/schemas/')) {
        out[k] = v.slice('#/components/schemas/'.length);
      } else {
        out[k] = rewriteRefs(v);
      }
    }
    return out;
  }
  return node;
}

function load(): Ajv2020 {
  if (ajv) return ajv;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
  const raw = fs.readFileSync(path.join(root, 'docs/driver-api/openapi.yaml'), 'utf8');
  const doc = parseYaml(raw) as OpenApiDoc;
  const instance = new Ajv2020({ allErrors: true, strict: false });
  addFormats(instance);
  for (const [name, schema] of Object.entries(doc.components.schemas)) {
    instance.addSchema(rewriteRefs(schema) as object, name);
  }
  ajv = instance;
  return instance;
}

/** Validate a body against an OpenAPI component schema name (e.g. Me, Job, Error). */
export function validateSchema(name: string, body: unknown): string[] {
  const instance = load();
  const validate = instance.getSchema(name);
  if (!validate) return [`unknown schema ${name}`];
  if (validate(body)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
}

export function validateError(body: unknown): string[] {
  return validateSchema('Error', body);
}
