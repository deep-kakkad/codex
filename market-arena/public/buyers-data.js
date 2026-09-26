// "Build buyers from your data": an optional side panel in the Buyers step.
//
// Paste interview notes, reviews, survey answers or sales-call notes; the server
// drafts a panel from them (10 credits, refunded if it fails) and every buyer comes
// back with the exact lines of the pasted text they are based on. The user reviews,
// edits or drops each one, then replaces the panel or adds to it. Nothing is used
// until they choose, and the pasted text never leaves this page except for the one
// request that drafts the buyers.

import { account, open as openSignIn, refresh as refreshAccount } from "./account.js";
import { buyerFace, segmentTint } from "./icons.js";
import { PERSONA_LIMITS } from "./validate.js";
import { toast } from "./ui.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TEXT_MIN = 400, TEXT_MAX = 40000, WORDS_GOOD = 300;
const words = (t) => (t.trim().match(/\S+/g) || []).length;
const LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
export const DOC_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';

/* opts: { getState, apply(buyers, mode), market() } */
export function initDataSheet({ getState, apply, market }) {
  let el, scrim, text = "", count = 8, keepSegs = false, draft = null, lastFocus = null;

  function mount() {
    if (el) return;
    scrim = Object.assign(document.createElement("div"), { className: "drawer-scrim" });
    el = Object.assign(document.createElement("aside"), { className: "drawer ds-sheet" });
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Build buyers from your data");
    document.body.append(scrim, el);
    scrim.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && el.classList.contains("open")) close(); });
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
  }
  function open() {
    mount();
    lastFocus = document.activeElement;
    count = Math.max(PERSONA_LIMITS.minPersonas, Math.min(PERSONA_LIMITS.maxPersonas, getState().personas.length || 8));
    draft ? paintReview() : paintPaste();
    requestAnimationFrame(() => { scrim.classList.add("open"); el.classList.add("open"); el.querySelector("#dsText, .dsb input")?.focus(); });
  }
  function close() {
    if (!el) return;
    scrim.classList.remove("open"); el.classList.remove("open");
    lastFocus?.focus?.();
  }
  const head = (kick, title) => `<div class="drawer-head"><div class="dh"><span class="drawer-kick">${kick}</span><h3>${title}</h3></div><button class="drawer-x" type="button" data-ds-close aria-label="Close">×</button></div>`;

  function paintPaste(error = "") {
    const st = getState();
    const segs = [...new Set(st.personas.map((p) => p.segment).filter(Boolean))];
    const me = account();
    const cost = me.costs?.ask ?? 10;
    el.innerHTML = `${head("Optional", "Turn your customer notes into buyers")}
      <div class="drawer-body ds">
        <p class="drawer-lede">Paste what you already know about your customers: interview notes, reviews, survey answers, sales-call notes. We draft buyers from it. You check every one before they join.</p>
        <label class="ds-lab" for="dsText"><span>Your notes</span><span class="count" id="dsCount"></span></label>
        <textarea id="dsText" class="field ds-text" maxlength="${TEXT_MAX}" placeholder="Paste reviews, interview notes or survey answers here. The messier, the better.">${esc(text)}</textarea>
        <div class="ds-under"><label class="ds-file">Or drop in a .txt or .csv file<input type="file" id="dsFile" accept=".txt,.csv,.md,text/plain,text/csv"></label><span class="ds-hint" id="dsHint"></span></div>
        <div class="ds-row"><span>How many buyers</span><div class="seg-ctl" role="group" aria-label="How many buyers">${[4, 8, 12, 16].map((n) =>
          `<button type="button" class="psize${n === count ? " active" : ""}" data-dsn="${n}">${n}</button>`).join("")}</div></div>
        ${segs.length ? `<label class="ds-check"><input type="checkbox" id="dsSegs"${keepSegs ? " checked" : ""}> Keep my current segments <span>${esc(segs.slice(0, 4).join(", "))}${segs.length > 4 ? "…" : ""}</span></label>` : ""}
        <p class="ds-private">${LOCK}<span>We strip out emails, phone numbers and links before anything is sent. Your notes aren't stored. Only the buyers you keep are.</span></p>
        ${st.rounds.length ? `<p class="caveat">Heads up: this project already has ${st.rounds.length === 1 ? "a round" : "rounds"}. Change the buyers now and the next round won't compare cleanly with the earlier ones.</p>` : ""}
        ${error ? `<p class="fielderr" role="alert">${esc(error)}</p>` : ""}
      </div>
      <div class="ds-foot"><span class="ds-cost">${cost} credits, back if it fails</span>
        ${me.signedIn ? `<button class="btn-primary" type="button" id="dsDraft">Draft ${count} buyers</button>` : `<button class="btn-primary" type="button" data-ds-signin>Sign in to draft buyers</button>`}</div>`;
    updateCount();
  }
  function updateCount() {
    const w = words(text);
    const c = el.querySelector("#dsCount"); if (c) c.textContent = `${w.toLocaleString()} words`;
    const h = el.querySelector("#dsHint");
    if (h) h.textContent = text.trim().length < TEXT_MIN ? "A few reviews or a page of notes is enough to start."
      : w < WORDS_GOOD ? "More text, better buyers. With this little, they'll be part guesswork." : "";
    const b = el.querySelector("#dsDraft"); if (b) b.disabled = text.trim().length < TEXT_MIN;
  }

  async function runDraft() {
    const st = getState();
    const segs = keepSegs ? [...new Set(st.personas.map((p) => p.segment).filter(Boolean))] : [];
    el.innerHTML = `${head("Drafting", `Reading your notes`)}
      <div class="drawer-body ds"><p class="drawer-lede" role="status">Drafting ${count} buyers and checking every line they quote against your notes, word for word. Usually under ten seconds.</p>
        ${Array.from({ length: 3 }, () => `<div class="dsb dsb-skel"><span class="skel" style="width:44px;height:44px;border-radius:50%"></span><div><span class="skel" style="height:14px;width:40%;margin-bottom:10px"></span><span class="skel" style="height:10px;width:90%;margin-bottom:6px"></span><span class="skel" style="height:10px;width:70%"></span></div></div>`).join("")}</div>`;
    try {
      const res = await fetch("/api/buyers", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, count, segments: segs, market: market() }) });
      const d = await res.json().catch(() => ({}));
      refreshAccount?.().catch?.(() => {});
      if (!res.ok) throw new Error(d.error || "Couldn't draft the buyers. Nothing was charged.");
      draft = { ...d, buyers: d.buyers.map((b) => ({ ...b, keep: true })) };
      paintReview();
    } catch (e) { paintPaste(e.message); }
  }

  function paintReview() {
    const st = getState();
    const segOrder = [...new Set(draft.buyers.map((b) => b.segment))];
    const kept = draft.buyers.filter((b) => b.keep).length;
    const L = PERSONA_LIMITS;
    const canAdd = kept > 0 && st.personas.length + kept <= L.maxPersonas;
    const canReplace = kept >= L.minPersonas;
    el.innerHTML = `${head("Review", `${draft.buyers.length} buyers drafted`)}
      <div class="drawer-body ds">
        <p class="drawer-lede">${esc(draft.summary || "Drafted from your notes.")} Every line under a buyer is copied straight from your text. Edit anything, and untick anyone you don't want.</p>
        ${draft.gaps ? `<p class="ds-gaps"><b>What your notes don't cover:</b> ${esc(draft.gaps)}</p>` : ""}
        ${draft.buyers.length < count ? `<p class="ds-note">You asked for ${count}. Your notes had ${draft.buyers.length} genuinely different people in them.</p>` : ""}
        ${draft.droppedQuotes || draft.sharedQuotes || draft.droppedBuyers || draft.renamed ? `<p class="ds-note">${[
          draft.droppedQuotes ? `${draft.droppedQuotes} quoted line${draft.droppedQuotes === 1 ? " wasn't an exact excerpt" : "s weren't exact excerpts"} of your text and ${draft.droppedQuotes === 1 ? "was" : "were"} removed` : "",
          draft.sharedQuotes ? `${draft.sharedQuotes} line${draft.sharedQuotes === 1 ? " was" : "s were"} kept with the first buyer ${draft.sharedQuotes === 1 ? "it" : "they"} described rather than repeated` : "",
          draft.droppedBuyers ? `${draft.droppedBuyers} buyer${draft.droppedBuyers === 1 ? "" : "s"} with nothing real behind them ${draft.droppedBuyers === 1 ? "was" : "were"} dropped` : "",
          draft.renamed ? `${draft.renamed} buyer${draft.renamed === 1 ? " was" : "s were"} renamed because the name appears in your text` : "",
        ].filter(Boolean).join("; ")}.</p>` : ""}
        <div class="dsbs">${draft.buyers.map((b, i) => `
          <div class="dsb${b.keep ? "" : " off"}" style="--seg:${segmentTint(segOrder.indexOf(b.segment))}">
            <label class="dsb-keep" title="Keep this buyer"><input type="checkbox" data-keep="${i}"${b.keep ? " checked" : ""}><span class="sr-only">Keep ${esc(b.name)}</span></label>
            ${buyerFace(b, segOrder.indexOf(b.segment), 44)}
            <div class="dsb-main">
              <div class="dsb-top"><input class="dsb-name" data-bf="name" data-i="${i}" maxlength="${L.name}" value="${esc(b.name)}" aria-label="Name">
                <input class="dsb-seg" data-bf="segment" data-i="${i}" maxlength="${L.segment}" value="${esc(b.segment)}" aria-label="Segment"></div>
              <textarea class="field dsb-prof" data-bf="profile" data-i="${i}" maxlength="${L.profile}" aria-label="Profile">${esc(b.profile)}</textarea>
              <div class="dsb-src"><span>Straight from your notes</span>${b.quotes.map((q) => `<blockquote>${esc(q)}</blockquote>`).join("")}</div>
            </div>
          </div>`).join("")}</div>
        <button class="btn-quiet ds-again" type="button" data-ds-again>Start again with different notes</button>
      </div>
      <div class="ds-foot"><span class="ds-cost">${kept} of ${draft.buyers.length} selected</span>
        <button class="btn" type="button" data-apply="add"${canAdd ? "" : " disabled"} title="${canAdd ? "" : `A panel holds at most ${L.maxPersonas} buyers`}">Add to my panel</button>
        <button class="btn-primary" type="button" data-apply="replace"${canReplace ? "" : " disabled"} title="${canReplace ? "" : `A panel needs at least ${L.minPersonas} buyers`}">Replace my panel</button></div>`;
  }

  function onInput(e) {
    if (e.target.id === "dsText") { text = e.target.value; updateCount(); return; }
    const f = e.target.dataset.bf;
    if (f && draft) draft.buyers[+e.target.dataset.i][f] = e.target.value;
  }
  async function onChange(e) {
    if (e.target.id === "dsSegs") keepSegs = e.target.checked;
    if (e.target.dataset.keep != null && draft) { draft.buyers[+e.target.dataset.keep].keep = e.target.checked; paintReview(); }
    if (e.target.id === "dsFile" && e.target.files?.[0]) {
      const f = e.target.files[0];
      if (f.size > TEXT_MAX * 4) { toast("That file's too big. Paste the most useful part instead.", { tone: "error" }); return; }
      text = ((text.trim() ? text.trim() + "\n\n" : "") + (await f.text())).slice(0, TEXT_MAX);
      el.querySelector("#dsText").value = text; updateCount();
    }
  }
  function onClick(e) {
    if (e.target.closest("[data-ds-close]")) return close();
    if (e.target.closest("[data-ds-signin]")) { close(); return openSignIn("login"); }
    const n = e.target.closest("[data-dsn]");
    if (n) { count = +n.dataset.dsn; el.querySelectorAll("[data-dsn]").forEach((b) => b.classList.toggle("active", b === n)); const d = el.querySelector("#dsDraft"); if (d) d.textContent = `Draft ${count} buyers`; return; }
    if (e.target.closest("#dsDraft")) return runDraft();
    if (e.target.closest("[data-ds-again]")) { draft = null; return paintPaste(); }
    const a = e.target.closest("[data-apply]");
    if (a && draft) {
      const chosen = draft.buyers.filter((b) => b.keep && b.name.trim() && b.segment.trim() && b.profile.trim());
      apply(chosen.map(({ name, segment, profile, quotes }, i) => ({ id: `d${Date.now().toString(36)}${i}`, name: name.trim(), segment: segment.trim(), profile: profile.trim(), source: "data", quotes })), a.dataset.apply);
      toast(`${chosen.length} buyer${chosen.length === 1 ? "" : "s"} from your notes ${a.dataset.apply === "replace" ? "now make up your panel" : "just joined your panel"}.`);
      draft = null; text = "";
      close();
    }
  }
  return { open };
}
