// An ad, split into the parts a buyer can point at: the headline, each sentence of
// the value proposition, the price and every optional field that was written.
//
// The engine asks buyers which part most made them want the product and which most
// put them off; the report draws the answers on the same parts of the ad mocks. Both
// sides split with this one function, so a mark always lands on the words it is about.

export const PART_LABEL = {
  headline: "The headline", subheadline: "The subheadline", price: "The price", offer: "The offer",
  proof: "The proof point", audience: "Who it is for", cta: "The call to action", visual: "The visual",
};
const MAX_BODY = 4;

// "Roasted this week. Delivered to your door." -> two sentences. Anything past the
// fourth sentence stays with the fourth, so a long paragraph can't flood the list.
export function sentences(text) {
  const s = String(text || "").trim();
  if (!s) return [];
  const parts = s.split(/(?<=[.!?])\s+(?=\S)/).map((x) => x.trim()).filter(Boolean);
  if (parts.length <= MAX_BODY) return parts;
  return [...parts.slice(0, MAX_BODY - 1), parts.slice(MAX_BODY - 1).join(" ")];
}

// ad: { headline, valueProp, price, extras: { subheadline, cta, offer, proof, audience, visual } }
// Returns [{ key, label, text }] in reading order.
export function adParts(ad) {
  const x = ad.extras || {};
  const out = [];
  const add = (key, label, text) => { if (text && String(text).trim()) out.push({ key, label, text: String(text).trim() }); };
  add("headline", PART_LABEL.headline, ad.headline);
  add("subheadline", PART_LABEL.subheadline, x.subheadline);
  const body = sentences(ad.valueProp);
  body.forEach((t, i) => add(`body${i + 1}`, body.length > 1 ? `Line ${i + 1} of the value proposition` : "The value proposition", t));
  add("price", PART_LABEL.price, ad.price);
  add("offer", PART_LABEL.offer, x.offer);
  add("proof", PART_LABEL.proof, x.proof);
  add("audience", PART_LABEL.audience, x.audience);
  add("cta", PART_LABEL.cta, x.cta);
  add("visual", PART_LABEL.visual, x.visual);
  return out;
}

// A "put off" answer only counts as a finding when one part clearly stands out: when
// nothing in an ad is wrong, buyers' answers spread thinly across every part, and that
// spread is noise, not a signal. Measured: a planted bad line drew 96% of the panel;
// clean ads spread 10–17% per part.
export const PUSH_MIN = 0.3;
export function clearPush(push) {
  if (!push) return null;
  const none = push.none ?? 0;
  const [key, v] = Object.entries(push).filter(([k]) => k !== "none").sort((a, b) => b[1] - a[1])[0] || [];
  return key && v >= PUSH_MIN && v > none ? { key, share: v } : null;
}
