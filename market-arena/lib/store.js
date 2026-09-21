// Storage for shared round snapshots (the "Copy share link" feature).
// Netlify Blobs when deployed on Netlify (zero-config there, via the NETLIFY
// env var Netlify sets automatically); a local JSON-file store for `node
// server.js` dev, so local dev stays dependency-free.
import { randomBytes } from "node:crypto";

const ID_RE = /^[A-Za-z0-9_-]{6,16}$/;
const newId = () => randomBytes(6).toString("base64url");

let impl;
async function getImpl() {
  if (impl) return impl;
  if (process.env.NETLIFY) {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({ name: "shares", consistency: "strong" });
    impl = {
      async save(data) { const id = newId(); await store.setJSON(id, data); return id; },
      async get(id) { return ID_RE.test(id) ? await store.get(id, { type: "json" }) : null; },
    };
  } else {
    const { mkdir, readFile, writeFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const dir = fileURLToPath(new URL("../.data/shares/", import.meta.url));
    await mkdir(dir, { recursive: true });
    impl = {
      async save(data) { const id = newId(); await writeFile(dir + id + ".json", JSON.stringify(data)); return id; },
      async get(id) { if (!ID_RE.test(id)) return null; try { return JSON.parse(await readFile(dir + id + ".json", "utf8")); } catch { return null; } },
    };
  }
  return impl;
}

export async function saveShare(data) { return (await getImpl()).save(data); }
export async function getShareById(id) { return (await getImpl()).get(id); }
