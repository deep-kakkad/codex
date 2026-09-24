// Offline tests for the round engine. The TypeSafe call is stubbed, so these cost
// nothing and can run on every change. Run: node test/engine.test.mjs
import assert from "node:assert/strict";

process.env.TYPESAFE_API_KEY = "test-key";
const { runRound } = await import("../lib/engine.js");

/* The stub deliberately models a position-biased judge: the ad listed FIRST in the
   serialised `ads` object always wins. If the engine did not rotate the presentation
   order per buyer, every buyer would pick the same contender and that contender would
   take 100% of the panel. Balanced output is therefore proof the rotation is live. */
let seenOrders = [];
globalThis.fetch = async (_url, opts) => {
  const { state, questions } = JSON.parse(opts.body);
  const answers = {};
  const adIds = Object.keys(state.ads || {});
  if (state.customer) seenOrders.push(adIds.join(","));

  for (const [name, q] of Object.entries(questions)) {
    if (name === "purchase") {
      const opts2 = Object.keys(q.criteria);
      // 60% to whichever ad was serialised first, the rest split evenly.
      const first = adIds[0];
      const rest = opts2.filter((o) => o !== first);
      const probabilities = { [first]: 0.6 };
      rest.forEach((o) => (probabilities[o] = 0.4 / rest.length));
      answers.purchase = { choice: first, probabilities, confidence: 0.8 };
    } else if (name.endsWith("__appeal")) {
      answers[name] = { score: 2, probabilities: {}, confidence: 0.7 };
    } else if (name.endsWith("__objection")) {
      answers[name] = { choice: "price", probabilities: { price: 0.5, trust: 0.2, relevance: 0.2, unclear: 0.1, none: 0 } };
    } else {
      answers[name] = { noul: 0.5, confidence: 0.7 };
    }
  }
  return { ok: true, status: 200, json: async () => ({ model: "stub", answers, usage: { input_tokens: 100 } }) };
};

const teams = [
  { brand: "Alpha", headline: "h1", valueProp: "v1", price: "$10" },
  { brand: "Beta", headline: "h2", valueProp: "v2", price: "$20" },
  { brand: "Gamma", headline: "h3", valueProp: "v3", price: "$30" },
];
const personas = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i + 1}`, name: `Buyer ${i + 1}`, segment: `Seg ${(i % 4) + 1}`, profile: `profile ${i + 1}`,
}));

const r = await runRound(teams, personas);

/* --- 1. presentation order is counterbalanced, not fixed ------------------ */
assert.equal(seenOrders.length, 12, "one model call per buyer");
assert.equal(new Set(seenOrders).size, 3, `expected 3 distinct orderings, got ${[...new Set(seenOrders)].join(" | ")}`);
const firstPositions = {};
seenOrders.forEach((o) => { const f = o.split(",")[0]; firstPositions[f] = (firstPositions[f] || 0) + 1; });
assert.deepEqual(Object.values(firstPositions).sort(), [4, 4, 4], "each contender should lead for 4 of 12 buyers");
console.log("ok  order is counterbalanced — each contender leads exactly 4 of 12 times");

/* --- 2. the position bias is neutralised in the aggregate ----------------- */
// Against a judge that always picks whatever is first, a fixed order would give one
// contender 12/12. Rotation should split them evenly instead.
const picks = r.brands.map((b) => b.picks);
assert.deepEqual(picks, [4, 4, 4], `expected an even 4/4/4 split, got ${picks.join("/")}`);
console.log("ok  a first-position-biased judge no longer hands one contender the panel");

/* --- 3. picks and share are separate statistics, both reported ------------ */
r.brands.forEach((b) => {
  assert.equal(typeof b.share, "number");
  assert.equal(typeof b.picks, "number");
  // pickRate goes through the engine's 3dp rounding, so compare at that resolution.
  assert.ok(Math.abs(b.pickRate - b.picks / r.panel) < 0.001, "pickRate must equal picks/panel");
});
assert.equal(r.panel, 12, "panel size is carried with the numbers");
assert.equal(r.brands.reduce((s, b) => s + b.picks, 0) + r.noPurchase.picks, r.panel, "picks must sum to the panel");
const shareSum = r.brands.reduce((s, b) => s + b.share, 0) + r.noPurchase.share;
assert.ok(Math.abs(shareSum - 1) < 0.02, `shares should sum to ~1, got ${shareSum.toFixed(3)}`);
console.log("ok  picks sum to the panel; shares sum to 1; they are reported separately");

/* --- 4. per-buyer margin exists and is sane ------------------------------- */
r.customers.forEach((c) => {
  assert.ok(c.margin >= 0 && c.margin <= 1, `margin out of range: ${c.margin}`);
});
// The stub gives the leader 0.6 and splits 0.4 across the three remaining options
// (two ads plus "none"), so the gap to second place is 0.6 - 0.133 = 0.467.
assert.ok(Math.abs(r.customers[0].margin - 0.467) < 0.002, `expected margin ~0.467, got ${r.customers[0].margin}`);
console.log("ok  per-buyer margin reports how close the call was");

/* --- 5. segment denominators are carried --------------------------------- */
assert.deepEqual(Object.values(r.segmentSizes), [3, 3, 3, 3], "4 segments of 3 buyers");
r.brands.forEach((b) => r.segments.forEach((s) => {
  assert.ok(b.bySegmentPicks[s] <= r.segmentSizes[s], "segment picks cannot exceed segment size");
}));
console.log("ok  segment sizes are carried alongside segment numbers");

console.log("\nall engine tests passed");
