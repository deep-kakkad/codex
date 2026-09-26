// Buyers from your own data.
//
// A team pastes what it already knows about its customers (interview notes, reviews,
// survey answers, sales-call notes) and a model drafts a buyer panel from it. The
// team reviews every buyer before using them; nothing here runs a round.
//
// Three rules keep it honest:
//  - Every buyer carries the lines of the team's own text they are based on, and each
//    line is checked on the server to be an exact excerpt. A quote the model wrote
//    rather than copied is dropped, and a buyer left with no real quote is dropped.
//  - Obvious personal details (emails, phone numbers, links) are removed before the
//    text leaves the server, and the model is told never to reuse a person's name.
//  - The pasted text is not stored anywhere. Only the drafted buyers go back.

import { PERSONA_LIMITS } from "../public/validate.js";

const API = "https://api.openai.com/v1/responses";
export const BUYERS_MODEL = process.env.BUYERS_MODEL || process.env.RESEARCH_MODEL || "gpt-5.4-mini";
export const TEXT_MIN = 400;      // characters; below this there is nothing to build from
export const TEXT_MAX = 40000;    // characters; about 6,000 words
const QUOTE_MAX = 160;
// Used when the model reuses a name that appears in the material, which could be a
// real customer's. The buyer keeps everything else and gets one of these instead.
const SPARE_NAMES = ["Asha", "Kabir", "Leila", "Mateo", "Nia", "Omar", "Sana", "Tomas", "Yara", "Zoe", "Ines", "Jonah", "Mira", "Tara", "Luca", "Noor", "Elif", "Kenji"];
const wordIn = (w, text) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "gaps", "buyers"],
  properties: {
    summary: { type: "string" },
    gaps: { type: "string" },
    buyers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "segment", "profile", "quotes"],
        properties: {
          name: { type: "string" },
          segment: { type: "string" },
          profile: { type: "string" },
          quotes: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const INSTRUCTIONS = `You turn a company's own customer material (interview notes, reviews, survey
answers, sales-call notes) into a panel of simulated buyers for testing marketing
messages. Each buyer will later read ads and decide whether to buy, so the profile
must say what this kind of person needs, doubts and weighs when deciding.

RULES
- Describe only what the material supports. Every buyer is a distinct kind of person
  who actually appears in it. Do not invent facts the material does not suggest.
- profile: third person, at most 240 characters, plain words, no marketing language.
  Cover their situation, what they want, what makes them doubt, and what they weigh
  (price, proof, convenience, taste, risk...). Give an age or age range only if the
  material implies one.
- name: a common first name you choose, plausible for this market. Never use a name
  that appears in the material.
- segment: a short label (at most 30 characters) for the group this buyer belongs to.
  Use the requested segments when given; otherwise use 2 to 4 groups the material
  clearly shows. Spread buyers across groups roughly in proportion to how often each
  kind of person appears.
- quotes: 1 to 3 short passages copied EXACTLY, character for character, from the
  material, that this buyer is based on. Each quote must be about this kind of
  person specifically, and each passage may be used for ONE buyer only; if two
  buyers would need the same passage, they are probably the same buyer. Never
  paraphrase, shorten inside, or fix spelling in a quote. At most 160 characters
  each. Skip passages that contain a person's name or contact details.
- summary: one sentence on what the material is (for example "40 app-store reviews
  and 6 interview notes about a meal-kit subscription").
- gaps: one sentence on what the material does not cover that matters for buying
  decisions, or an empty string.
Return the number of buyers asked for, unless the material cannot support that many
distinct people; then return fewer and say so in gaps.`;

// Obvious personal details, replaced before the text is sent anywhere.
export function redact(text) {
  let n = 0;
  const sub = (re, what) => (s) => s.replace(re, () => { n++; return what; });
  const out = [
    sub(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"),
    sub(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[link]"),
  ].reduce((s, f) => f(s), String(text))
    // A phone number has at least nine digits; dates and prices have fewer.
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => ((m.match(/\d/g) || []).length >= 9 ? (n++, "[phone]") : m));
  return { text: out, redactions: n };
}

// Quotes are compared loosely on whitespace, case and quote marks, strictly on words.
const norm = (s) => String(s || "").toLowerCase()
  .replace(/[‘’‛′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—]/g, "-")
  .replace(/\s+/g, " ").trim();

// Keeps only quotes that really are excerpts, trims every field to the app's limits,
// and drops buyers with nothing real behind them or a name already taken.
export function verifyBuyers(raw, source) {
  const hay = norm(source);
  const L = PERSONA_LIMITS;
  const names = new Set();
  const used = new Set();   // a passage backs one buyer only
  const kept = [];
  // Two different reasons a quote goes, counted apart so the review can say which:
  // it was not an exact excerpt (the model wrote it), or it already backs another buyer.
  let droppedQuotes = 0, sharedQuotes = 0, droppedBuyers = 0, renamed = 0;
  for (const b of Array.isArray(raw) ? raw : []) {
    const quotes = (Array.isArray(b?.quotes) ? b.quotes : [])
      .map((q) => String(q || "").trim().replace(/^["“]|["”]$/g, "").trim())
      .filter((q) => q.length >= 8 && q.length <= QUOTE_MAX + 40);
    const exact = [...new Set(quotes)].filter((q) => hay.includes(norm(q)));
    const real = exact.filter((q) => !used.has(norm(q)));
    droppedQuotes += quotes.length - exact.length;
    sharedQuotes += exact.length - real.length;
    let name = String(b?.name || "").trim().slice(0, L.name);
    const segment = String(b?.segment || "").trim().slice(0, L.segment);
    const profile = String(b?.profile || "").trim().replace(/\s+/g, " ").slice(0, L.profile);
    if (!real.length || !name || !segment || profile.length < 20 || names.has(name.toLowerCase())) { droppedBuyers++; continue; }
    if (wordIn(name, source)) {
      const spare = SPARE_NAMES.find((n) => !names.has(n.toLowerCase()) && !wordIn(n, source) && !raw.some((x) => x?.name === n));
      if (!spare) { droppedBuyers++; continue; }
      name = spare; renamed++;
    }
    names.add(name.toLowerCase());
    real.slice(0, 3).forEach((q) => used.add(norm(q)));
    kept.push({ name, segment, profile, quotes: real.slice(0, 3).map((q) => q.slice(0, QUOTE_MAX)) });
  }
  return { buyers: kept, droppedQuotes, sharedQuotes, droppedBuyers, renamed };
}

export async function draftBuyers({ text, count = 8, segments = [], market = "" }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("no-key");
  const { text: clean, redactions } = redact(text);
  const input = [
    market ? `The market: ${market}` : "",
    `Buyers to draft: ${count}`,
    segments.length ? `Segments to use: ${segments.join("; ")}` : "",
    "",
    "MATERIAL",
    clean,
  ].filter((x) => x !== "").join("\n");

  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: BUYERS_MODEL,
      instructions: INSTRUCTIONS,
      input,
      text: { format: { type: "json_schema", name: "buyer_panel", strict: true, schema: SCHEMA } },
      max_output_tokens: 6000,
    }),
    signal: AbortSignal.timeout(50000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `OpenAI returned ${res.status}`);
  const out = (body.output || []).filter((o) => o.type === "message").flatMap((o) => o.content || [])
    .filter((c) => c.type === "output_text").map((c) => c.text).join("");
  let raw;
  try { raw = JSON.parse(out); } catch { throw new Error("The draft came back in a shape we couldn't read."); }

  const checked = verifyBuyers(raw.buyers, clean);
  return {
    summary: String(raw.summary || "").trim().slice(0, 240),
    gaps: String(raw.gaps || "").trim().slice(0, 240),
    ...checked,
    redactions,
    model: body.model || BUYERS_MODEL,
  };
}
