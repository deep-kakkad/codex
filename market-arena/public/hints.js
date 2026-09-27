// Gentle writing checks, while you type. Free: plain rules, no model call.
//
// They point at things buyers can trip on (a price with no amount, a claim with
// nothing behind it, a headline too long to take in at a glance) and say why, in one
// line. Never a score, never "good" or "bad", and at most one per field so the editor
// stays calm. Each can be dismissed, and the round is the real judge anyway.

const WORDS = (s) => (s.trim().match(/\S+/g) || []).length;
const HYPE = /\b(best|#1|number one|world[- ]class|revolutionary|ultimate|unbeatable|game[- ]chang\w*|the only)\b/i;

/* field: "headline" | "valueProp" | "price" | "subheadline" | "cta" | "offer"
   others: [{ brand, value }] the same field in the other versions.
   Returns { rule, text } or null. */
export function hintFor(field, value, { others = [] } = {}) {
  const v = String(value || "").trim();
  if (!v) return null;
  const dup = others.find((o) => o.value && o.value.trim().toLowerCase() === v.toLowerCase());
  if (dup && ["headline", "valueProp", "subheadline"].includes(field))
    return { rule: "dup", text: `Same as ${dup.brand || "another version"}'s. If that's on purpose, this round tests everything else.` };
  const letters = v.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 6 && letters === letters.toUpperCase() && field !== "cta")
    return { rule: "caps", text: "All capitals can read as shouting. Buyers tend to trust a calmer line more." };
  const hype = HYPE.exec(v);
  if (hype && ["headline", "valueProp", "subheadline", "offer"].includes(field))
    return { rule: "hype", text: `“${hype[0]}” with nothing behind it. Buyers who doubt claims will look for proof: a number, a guarantee, a name.` };
  if (field === "headline" && WORDS(v) > 12)
    return { rule: "long", text: `${WORDS(v)} words. A headline gets a glance, so a shorter one is easier to take in.` };
  if (field === "valueProp" && v.length > 40 && !/\d/.test(v))
    return { rule: "nonum", text: "No number in here. A specific figure (a time, an amount, a count) is easier to believe than a general promise." };
  if (field === "price" && !/\d/.test(v) && !/\bfree\b/i.test(v))
    return { rule: "noamount", text: "No amount in the price. Buyers can't weigh a price they can't see." };
  if ((v.match(/!/g) || []).length >= 2)
    return { rule: "bang", text: "More than one exclamation mark can read as hype." };
  return null;
}

// Hints someone dismissed stay dismissed for that field in this browser.
const KEY = "market-arena-hints-off";
let off;
const load = () => { if (off) return off; try { off = new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { off = new Set(); } return off; };
export const hintIsOff = (id) => load().has(id);
export function dismissHint(id) { load().add(id); try { localStorage.setItem(KEY, JSON.stringify([...off].slice(-200))); } catch {} }

// The line under a field. `id` names the field and the rule, so dismissing one hint
// on one field doesn't silence the same advice everywhere.
export function hintHtml(fieldId, hint) {
  if (!hint) return `<p class="hint" data-hint-for="${fieldId}" hidden></p>`;
  const id = `${fieldId}:${hint.rule}`;
  if (hintIsOff(id)) return `<p class="hint" data-hint-for="${fieldId}" hidden></p>`;
  return `<p class="hint" data-hint-for="${fieldId}"><span>${hint.text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</span><button type="button" class="hint-x" data-hint-off="${id}" aria-label="Hide this tip">×</button></p>`;
}
