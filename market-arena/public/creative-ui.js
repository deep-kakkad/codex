// Uploaded creatives in the builder: preparing an image in the browser, the field on
// each version card, and reading new images into the descriptions the buyers judge.
//
// The browser does the heavy lifting before anything is sent: it shrinks the image
// to at most 1280px (enough to read small print), makes a small preview for the
// page, and fingerprints the upload with SHA-256, the same fingerprint the server
// uses, so an image that hasn't changed is recognised as the same creative.

import { CREATIVE_FIELDS } from "./validate.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const IMG_IC = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/></svg>';
export const ACCEPT = "image/jpeg,image/png,image/webp";

async function scaled(bitmap, max, quality) {
  const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);          // transparent PNGs read against white
  x.drawImage(bitmap, 0, 0, w, h);
  return c.toDataURL("image/jpeg", quality);
}
async function fingerprint(dataUrl) {
  const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (ch) => ch.charCodeAt(0));
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// file -> { id, upload, thumb, name, w, h }, or throws a message for the person.
export async function prepareImage(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP image.");
  if (file.size > 25 * 1024 * 1024) throw new Error("That image is over 25 MB. Try a smaller export.");
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error("That image couldn't be opened."); }
  const upload = await scaled(bmp, 1280, 0.86);
  const thumb = await scaled(bmp, 560, 0.8);
  const out = { id: await fingerprint(upload), upload, thumb, name: String(file.name || "image").slice(0, 80), w: bmp.width, h: bmp.height };
  bmp.close?.();
  return out;
}

export function descriptionList(d) {
  if (!d) return "";
  return `<dl class="cr-dl">${CREATIVE_FIELDS.filter((f) => d[f.key]).map((f) =>
    `<div><dt>${esc(f.label)}</dt><dd>${f.key === "words_on_image" ? `“${esc(d[f.key])}”` : esc(d[f.key])}</dd></div>`).join("")}</dl>`;
}

// The field on a version card.
export function creativeField(t, i, { cost = 10 } = {}) {
  const c = t.creative;
  const input = (label) => `<input type="file" id="creative-${i}" data-cr-file="${i}" accept="${ACCEPT}" class="cr-input" aria-label="${label}">`;
  if (!c) {
    return `<div class="cr-field">
      <span class="cr-lab">Creative</span>
      <label class="cr-drop" data-cr-drop="${i}">${input(`Upload a creative for ${esc(t.brand || `version ${i + 1}`)}`)}
        <span class="cr-drop-ic">${IMG_IC}</span>
        <b>Drop an image here, or click to choose</b>
        <span>JPG, PNG or WebP. The buyers read a description of it.</span>
      </label>
    </div>`;
  }
  const status = c.description
    ? `<span class="cr-ok">Read.</span> The buyers get this same description every round.`
    : `Not read yet. It's read when you run the round (${cost} credits for this round's new images).`;
  return `<div class="cr-field" data-cr-drop="${i}">
    <span class="cr-lab">Creative</span>
    <div class="cr-has">
      <img class="cr-thumb" src="${esc(c.thumb)}" alt="">
      <div class="cr-meta">
        <b title="${esc(c.name)}">${esc(c.name)}</b>
        <span class="cr-status">${status}</span>
        <span class="cr-acts"><label class="btn-quiet cr-replace">${input(`Replace the creative for ${esc(t.brand || `version ${i + 1}`)}`)}Replace</label><button type="button" class="btn-quiet" data-cr-remove="${i}">Remove</button></span>
      </div>
    </div>
    ${c.description ? `<details class="cr-read"><summary>What the buyers will read</summary>${descriptionList(c.description)}</details>` : ""}
  </div>`;
}

// The strip above the version cards while creatives are on: what the buyers can and
// can't judge, and a way to read new images before running.
export function creativeBar(teams, { signedIn, cost = 10, busy = false }) {
  const unread = teams.filter((t) => t.creative && !t.creative.description).length;
  const missing = teams.filter((t) => !t.creative).length;
  return `<div class="cr-bar">
    <span class="cr-bar-ic">${IMG_IC}</span>
    <div class="cr-bar-t"><b>Buyers don't see pixels. They read a description of each image:</b>
      its exact words, what it shows, the setting, colours and layout. So they can't tell which of two near-identical images looks better, or whether small text is readable on a phone.
      ${missing ? `<span class="cr-bar-todo">${missing} version${missing === 1 ? " still needs" : "s still need"} an image. Every version needs one, so it's a fair fight.</span>` : ""}</div>
    ${unread ? (signedIn
      ? `<button type="button" class="btn" data-cr-read${busy ? " disabled" : ""}>${busy ? "Reading…" : `Read ${unread === 1 ? "it" : `all ${unread}`} now · ${cost} credits`}</button>`
      : `<button type="button" class="btn" data-cr-signin>Sign in to read images</button>`) : ""}
  </div>`;
}

// Reads every creative that hasn't been read. Resolves to { read, charged, balance }.
export async function readCreatives(teams) {
  const todo = teams.filter((t) => t.creative && !t.creative.description);
  if (!todo.length) return { read: 0, charged: 0 };
  if (todo.some((t) => !t.creative.upload)) throw new Error("An image needs uploading again: replace it and try once more.");
  const res = await fetch("/api/creatives", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images: todo.map((t) => ({ data: t.creative.upload })) }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d.error || "Couldn't read the images. Nothing was charged."), { status: res.status });
  d.descriptions.forEach((x, k) => {
    const c = todo[k].creative;
    c.description = x.description;
    c.id = x.id;
    delete c.upload;                 // the full image isn't needed once it's been read
  });
  return { read: todo.length, charged: d.charged || 0, balance: d.balance };
}
