import 'server-only';
import { createClient, type SanityClient } from '@sanity/client';
import type { Answer } from '../forms/answers';
import type { FormKey } from '../forms/schemas';

function env(name: string): string {
  const fromProcess = typeof process !== 'undefined' ? process.env[name] : undefined;
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[name];
  return (fromProcess || fromMeta || '').trim();
}

export type SubmissionDoc = {
  _id: string;
  _type: 'formSubmission';
  status: 'new';
  form: { _type: 'reference'; _ref: string };
  formKey: FormKey;
  topic?: string;
  submittedAt: string;
  name: string;
  email: string;
  phone?: string;
  answers: Answer[];
  consent: boolean;
  emailStatus?: 'sent' | 'failed';
};

export type SanityWriter = {
  create: (doc: SubmissionDoc) => Promise<{ _id: string }>;
  patchEmailStatus: (id: string, status: 'sent' | 'failed') => Promise<void>;
  deleteOlderThan: (formKey: FormKey, isoDate: string, batch?: number) => Promise<number>;
};

function createWriteClient(): SanityClient {
  const projectId = env('SANITY_PROJECT_ID');
  const dataset = env('SANITY_DATASET') || 'production';
  const token = env('SANITY_WRITE_TOKEN');
  if (!projectId || !token) {
    throw new Error('SANITY_WRITE_TOKEN and SANITY_PROJECT_ID are required');
  }
  return createClient({
    projectId,
    dataset,
    apiVersion: '2026-10-01',
    useCdn: false,
    token,
    ignoreBrowserTokenWarning: true,
  });
}

function defaultWriter(): SanityWriter {
  const client = createWriteClient();
  return {
    async create(doc) {
      const created = await client.create(doc);
      return { _id: created._id };
    },
    async patchEmailStatus(id, status) {
      await client.patch(id).set({ emailStatus: status }).commit();
    },
    async deleteOlderThan(formKey, isoDate, batch = 100) {
      const ids = await client.fetch<string[]>(
        `*[_type == "formSubmission" && formKey == $formKey && submittedAt < $isoDate][0...$batch]._id`,
        { formKey, isoDate, batch },
      );
      let deleted = 0;
      for (const id of ids ?? []) {
        await client.delete(id);
        deleted += 1;
      }
      return deleted;
    },
  };
}

let writer: SanityWriter | null = null;

export function setSanityWriter(w: SanityWriter | null): void {
  writer = w;
}

function getWriter(): SanityWriter {
  return writer ?? defaultWriter();
}

export async function createSubmission(doc: SubmissionDoc): Promise<{ _id: string }> {
  return getWriter().create(doc);
}

export async function patchSubmissionEmailStatus(
  id: string,
  status: 'sent' | 'failed',
): Promise<void> {
  return getWriter().patchEmailStatus(id, status);
}

export async function deleteSubmissionsOlderThan(
  formKey: FormKey,
  isoDate: string,
  batch = 100,
): Promise<number> {
  return getWriter().deleteOlderThan(formKey, isoDate, batch);
}

export function newSubmissionId(): string {
  return `submission-${crypto.randomUUID()}`;
}
