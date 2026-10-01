import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Where recordings live. Netlify Blobs in production, a folder locally.
 * Keys look like `<candidateId>/<stageId>.webm` or, for think-aloud chunks,
 * `<candidateId>/<stageId>.part0/00003`.
 */
export interface FileStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

function safeKey(key: string) {
  if (!/^[\w.-]+(\/[\w.-]+)*$/.test(key) || key.includes('..')) throw new Error(`Unsafe storage key: ${key}`);
  return key;
}

export function localFileStore(dir: string): FileStore {
  return {
    async put(key, data) {
      const file = path.join(dir, safeKey(key));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, data);
    },
    async get(key) {
      try {
        return readFileSync(path.join(dir, safeKey(key)));
      } catch {
        return null;
      }
    },
  };
}

/**
 * Netlify Blobs. The store is looked up per operation because Lambda-style
 * functions receive fresh Blobs credentials with every invocation.
 */
/**
 * Inside Netlify functions the site is implicit; from elsewhere (seeding a
 * deployed site) pass its ID and an access token.
 */
export function netlifyBlobStore(name = 'recordings', site?: { siteID: string; token: string }): FileStore {
  const store = async () => (await import('@netlify/blobs')).getStore({ name, consistency: 'strong', ...(site ?? {}) });
  return {
    async put(key, data) {
      await (await store()).set(safeKey(key), new Uint8Array(data).buffer);
    },
    async get(key) {
      const value = await (await store()).get(safeKey(key), { type: 'arrayBuffer' });
      return value ? Buffer.from(value) : null;
    },
  };
}

export const chunkKey = (prefix: string, seq: number) => `${prefix}/${String(seq).padStart(5, '0')}`;

/** A think-aloud part is its chunks concatenated in order. */
export async function readChunks(files: FileStore, prefix: string, chunks: number): Promise<Buffer> {
  const buffers: Buffer[] = [];
  for (let seq = 0; seq < chunks; seq++) {
    const chunk = await files.get(chunkKey(prefix, seq));
    if (chunk) buffers.push(chunk);
  }
  return Buffer.concat(buffers);
}
