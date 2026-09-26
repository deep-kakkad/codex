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
const CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
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
  // The words on the image as the chips the card shows; everything else as plain facts.
  return `<dl class="cr-dl">${CREATIVE_FIELDS.filter((f) => d[f.key]).map((f) =>
    `<div><dt>${esc(f.label)}</dt><dd>${f.key === "words_on_image"
      ? `<span class="cr-words static">${wordBlocks(d).map((w) => `<span class="cr-word">${esc(w)}</span>`).join("")}</span>`
      : esc(d[f.key])}</dd></div>`).join("")}</dl>`;
}

// The words the image carries, one chip per block of text, in reading order.
export const wordBlocks = (d) => String(d?.words_on_image || "").split(" / ").map((w) => w.trim()).filter(Boolean);

// The image at the top of a version card: the ad itself, never cropped. It develops
// in when it arrives, a light sweeps down it while it is being read, and once read,
// the words found on it come out underneath as chips: the words the buyers get.
// opts: { cost, reading: this image is being read now, fresh: it just arrived,
//         justRead: its words just came back (the chips stagger in) }
export function creativeHero(t, i, { cost = 10, reading = false, fresh = false, justRead = false } = {}) {
  const c = t.creative;
  const input = (label) => `<input type="file" id="creative-${i}" data-cr-file="${i}" accept="${ACCEPT}" class="cr-input" aria-label="${label}">`;
  const who = esc(t.brand || `version ${i + 1}`);
  if (!c) {
    return `<div class="cr-hero-wrap">
      <label class="cr-drop cr-drop-hero" data-cr-drop="${i}">${input(`Upload the ad image for ${who}`)}
        <span class="cr-drop-ic">${IMG_IC}</span>
        <b>Drop the ad image here</b>
        <span>or click to choose. JPG, PNG or WebP.</span>
      </label>
    </div>`;
  }
  const words = wordBlocks(c.description);
  const state = reading ? `<span class="cr-chip-state reading">Reading…</span>`
    : c.description ? `<span class="cr-chip-state ok">${CHECK}Read</span>`
    : `<span class="cr-chip-state">Not read yet</span>`;
  return `<div class="cr-hero-wrap">
    <div class="cr-hero${fresh ? " fresh" : ""}${reading ? " reading" : ""}" data-cr-drop="${i}" data-cr-hero="${i}">
      <span class="cr-hero-bg" style="background-image:url('${esc(c.thumb)}')" aria-hidden="true"></span>
      <img class="cr-hero-img" src="${esc(c.thumb)}" alt="The ad image for ${who}">
      <span class="cr-scan" aria-hidden="true"></span>
      ${state}
      <span class="cr-hero-acts">
        <label class="cr-hbtn">${input(`Replace the ad image for ${who}`)}Replace</label>
        <button type="button" class="cr-hbtn" data-cr-remove="${i}">Remove</button>
      </span>
    </div>
    ${c.description ? `
      <div class="cr-words${justRead ? " just" : ""}" aria-label="Words the buyers read on this image">
        ${words.length ? words.slice(0, 6).map((w, k) => `<span class="cr-word" data-cr-word="${k}" style="--k:${k}">${esc(w)}</span>`).join("")
          + (words.length > 6 ? `<span class="cr-word more" style="--k:6">+${words.length - 6} more</span>` : "")
          : `<span class="cr-word none">No words on this image</span>`}
      </div>
      <div class="cr-row">
        <button type="button" class="cr-link" data-cr-details="${i}">What the buyers read</button>
        ${words.length ? `<button type="button" class="cr-link" data-cr-fill="${i}">Use the image's words</button>` : ""}
      </div>`
    : `<p class="cr-note">${reading ? "Reading the words and what the picture shows…" : `Read when you run the round, or now from the strip above (${cost} credits for a round's new images).`}</p>`}
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

/* ---- Motion helpers ----------------------------------------------------------
   One element moving between two places, the same language as the buyer faces
   flying into the panel: a copy is lifted from where it was and settles where it
   lands, while the real one waits hidden. Nothing moves under reduced motion. */
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/* text: the ghost keeps its own size and shape (words never stretch) and lands at the
   start of the field, fading as the real words appear there. delay staggers a group. */
export function fly(fromEl, toEl, { duration = 520, lift = 20, clone = null, text = false, delay = 0 } = {}) {
  if (!fromEl || !toEl || reduced() || !toEl.animate) return Promise.resolve();
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  if (!a.width || !b.width) return Promise.resolve();
  const ghost = clone || fromEl.cloneNode(true);
  Object.assign(ghost.style, { position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: 0,
    zIndex: 90, pointerEvents: "none", transformOrigin: "0 0", boxSizing: "border-box" });
  ghost.removeAttribute("id"); ghost.setAttribute("aria-hidden", "true");
  document.body.append(ghost);
  if (text) {
    const pad = parseFloat(getComputedStyle(toEl).paddingLeft) || 10;
    const dx = b.left + pad - 4 - a.left, dy = b.top + (b.height - a.height) / 2 - a.top;
    return ghost.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(1.06)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1, offset: 0.82 },
      { transform: `translate(${dx}px, ${dy}px) scale(.96)`, opacity: 0 },
    ], { duration, delay, easing: "cubic-bezier(.4,0,.2,1)", fill: "backwards" }).finished.catch(() => {}).then(() => ghost.remove());
  }
  const sx = b.width / a.width, sy = b.height / a.height;
  return ghost.animate([
    { transform: "translate(0,0) scale(1,1)" },
    { transform: `translate(${(b.left - a.left) / 2}px, ${(b.top - a.top) / 2 - lift}px) scale(${(1 + sx) / 2}, ${(1 + sy) / 2})`, offset: 0.55 },
    { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${sx}, ${sy})` },
  ], { duration, easing: "cubic-bezier(.4,0,.2,1)" }).finished.catch(() => {}).then(() => ghost.remove());
}

/* ---- The image's words, sorted into the version's fields --------------------
   A starting point, not a verdict: the price is the first price-shaped phrase, a
   button-shaped line becomes the call to action, the first real line is the
   headline, and the remaining lines make the value proposition. Product labels
   (the brand name, a short line in capitals) are left out. Every filled field is
   tagged, and the person can undo it. */
const PRICE = /(?:₹|Rs\.?\s?|\$|€|£)\s?\d[\d,.]*(?:\s?(?:\/|per|a)\s?(?:mo|month|cup|week|wk|yr|year|day|bottle|can|pack))?|\b\d[\d,.]*\s?(?:\/|per)\s?(?:mo|month)\b/i;
const CTA = /^(start|shop|buy|order|get|try|sign up|learn more|subscribe|book|claim|join|download|see|discover|grab|pick)\b/i;
export function sortImageWords(d, { brand = "" } = {}) {
  const blocks = wordBlocks(d).map((w) => w.replace(/^[✓✔•·\-–—]\s*/, "").replace(/[☀-➿️]/g, "").trim()).filter(Boolean);
  const out = {};
  const rest = [];
  const b0 = brand.trim().toLowerCase();
  for (const [n, w] of blocks.entries()) {
    const words = w.split(/\s+/).length;
    // A short line in capitals is usually a product label, unless it opens the ad.
    const label = (n > 0 && w.length <= 18 && w === w.toUpperCase() && /[A-Z]/.test(w)) || (b0 && b0.includes(w.toLowerCase()));
    if (label || /^\d{1,2}[:.]\d{2}\s?(am|pm)?$/i.test(w)) continue;
    if (CTA.test(w)) { if (!out.cta) out.cta = w; if (!out.price && PRICE.test(w)) out.price = w.match(PRICE)[0].trim(); continue; }
    // A price counts when it is most of the line, or set apart from it (· or |).
    // "Free delivery over $40" is an offer, not the price.
    const pm = w.match(PRICE);
    if (pm && (pm[0].length / w.length > 0.5 || /[·|]/.test(w))) {
      if (!out.price) out.price = pm[0].trim();
      const left = w.replace(pm[0], "").replace(/[·|,–—-]\s*$|^\s*[·|,–—-]/g, "").trim();
      if (left.split(/\s+/).length >= 2) rest.push(left);
      continue;
    }
    if (words < 2) continue;
    if (!out.headline && words >= 2) { out.headline = w; continue; }
    if (words >= 2) rest.push(w);
  }
  if (rest.length) out.valueProp = rest.map((x) => (/[.!?]$/.test(x) ? x : `${x}.`)).join(" ");
  // Which chip each field came from, so the chip can fly to it.
  out.from = {};
  for (const [k, v] of Object.entries(out)) if (k !== "from") {
    const idx = wordBlocks(d).findIndex((w) => w.includes(v.replace(/\.$/, "").split(". ")[0]));
    if (idx >= 0) out.from[k] = idx;
  }
  return out;
}

/* ---- The side panel: the image large, and what the buyers read -------------- */
let panel, scrim, lastFocus;
export function openCreativePanel(t, fromImg) {
  const c = t.creative;
  if (!c?.description) return;
  if (!panel) {
    scrim = Object.assign(document.createElement("div"), { className: "drawer-scrim" });
    panel = Object.assign(document.createElement("aside"), { className: "drawer crp" });
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", "What the buyers read");
    document.body.append(scrim, panel);
    const close = () => { scrim.classList.remove("open"); panel.classList.remove("open"); lastFocus?.focus?.(); };
    scrim.addEventListener("click", close);
    panel.addEventListener("click", (e) => { if (e.target.closest(".drawer-x")) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("open")) close(); });
  }
  lastFocus = document.activeElement;
  panel.innerHTML = creativePanelHtml({ brand: t.brand, thumb: c.thumb, description: c.description, name: c.name });
  requestAnimationFrame(() => { scrim.classList.add("open"); panel.classList.add("open"); panel.querySelector(".drawer-x")?.focus(); });
  const target = panel.querySelector(".crp-img");
  if (fromImg && target && !reduced()) {
    target.style.visibility = "hidden";
    // Measure where the picture will sit once the panel has slid in.
    setTimeout(() => fly(fromImg, target, { duration: 480 }).then(() => { target.style.visibility = ""; }), 30);
  }
}
// Shared with the report, which opens the same view in its own panel.
export function creativePanelHtml({ brand, thumb, description, name }) {
  return `<div class="drawer-head"><div class="dh"><span class="drawer-kick">${esc(brand || "Creative")}</span><h3>What the buyers read</h3></div>
      <button class="drawer-x" type="button" aria-label="Close">×</button></div>
    <div class="drawer-body crp-body">
      ${thumb ? `<div class="crp-frame"><span class="m-img-bg" style="background-image:url('${esc(thumb)}')" aria-hidden="true"></span><img class="crp-img" src="${esc(thumb)}" alt=""></div>`
        : `<div class="crp-frame none"><span>The image isn't included in this link. This is what the buyers read.</span></div>`}
      <p class="drawer-lede">The buyers never see the picture. They read this, word for word, every round, until the image changes.</p>
      ${descriptionList(description)}
      <p class="drawer-note">So they can't judge which of two near-identical images looks better, or whether small text is readable on a phone. Test those with real people.</p>
    </div>`;
}
