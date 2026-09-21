// Storage for shared round snapshots (the "Copy share link" feature).
// Tries Netlify Blobs first (zero-config when actually running as a Netlify
// Function); falls back to a local JSON-file store for `node server.js` dev.
// Detected by trying Blobs and catching failure rather than an env-var check
// — `process.env.NETLIFY` isn't reliably set inside the Functions runtime.
import { randomBytes } from "node:crypto";

const ID_RE = /^[A-Za-z0-9_-]{6,16}$/;
const newId = () => randomBytes(6).toString("base64url");

async function blobsImpl() {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: "shares", consistency: "strong" });
  await store.get("__probe__", { type: "json" }); // throws now if Blobs isn't actually configured, not on first real use
  return {
    async save(data) { const id = newId(); await store.setJSON(id, data); return id; },
    async get(id) { return ID_RE.test(id) ? await store.get(id, { type: "json" }) : null; },
  };
}

async function localImpl() {
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../.data/shares/", import.meta.url));
  await mkdir(dir, { recursive: true });
  return {
    async save(data) { const id = newId(); await writeFile(dir + id + ".json", JSON.stringify(data)); return id; },
    async get(id) { if (!ID_RE.test(id)) return null; try { return JSON.parse(await readFile(dir + id + ".json", "utf8")); } catch { return null; } },
  };
}

let impl;
async function getImpl() {
  if (impl) return impl;
  try { impl = await blobsImpl(); } catch { impl = await localImpl(); }
  return impl;
}

export async function saveShare(data) { return (await getImpl()).save(data); }
export async function getShareById(id) { return (await getImpl()).get(id); }
