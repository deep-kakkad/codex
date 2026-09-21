// The sample arena on the landing page: one real round, captured once via the
// practice-mode API (12 buyers, 3 real contenders) and replayed client-side.
// Nothing here is scripted — these are the actual percentages, funnel values,
// objections and per-buyer decisions the model returned. Round 2 is the same
// panel with Contender A's price cut from ₹699 to ₹549, also a real call.
export const ARENA = {
  scenario: "COFFEE SUBSCRIPTION",
  contenders: [
    { id: "A", headline: "Wake up to better coffee.", valueProp: "Specialty coffee delivered every month.", priceR1: "₹699/mo", priceR2: "₹549/mo" },
    { id: "B", headline: "Café-quality coffee. ₹23 a cup.", valueProp: "Freshly roasted beans delivered monthly.", priceR1: "₹699/mo", priceR2: "₹699/mo" },
    { id: "C", headline: "Never drink stale coffee again.", valueProp: "Roasted this week. Delivered to your door.", priceR1: "₹749/mo", priceR2: "₹749/mo" },
  ],
  buyers: [
    { id: "b1", name: "Aisha", age: 29, segment: "Convenience-first" },
    { id: "b2", name: "Farhan", age: 33, segment: "Convenience-first" },
    { id: "b3", name: "Priya", age: 27, segment: "Convenience-first" },
    { id: "b4", name: "Rohan", age: 34, segment: "Coffee enthusiast" },
    { id: "b5", name: "Devika", age: 31, segment: "Coffee enthusiast" },
    { id: "b6", name: "Arjun", age: 38, segment: "Coffee enthusiast" },
    { id: "b7", name: "Meera", age: 25, segment: "Price-sensitive" },
    { id: "b8", name: "Sandeep", age: 29, segment: "Price-sensitive" },
    { id: "b9", name: "Neha", age: 24, segment: "Price-sensitive" },
    { id: "b10", name: "Kabir", age: 41, segment: "Premium buyer" },
    { id: "b11", name: "Ananya", age: 36, segment: "Premium buyer" },
    { id: "b12", name: "Vikram", age: 45, segment: "Premium buyer" },
  ],
  round1: {
    share: { A: 0.227, B: 0.272, C: 0.408, none: 0.094 },
    winner: "C",
    funnel: {
      A: { saw: 0.345, interested: 0.574, believed: 0.572, chose: 0.227 },
      B: { saw: 0.458, interested: 0.617, believed: 0.568, chose: 0.272 },
      C: { saw: 0.502, interested: 0.622, believed: 0.607, chose: 0.408 },
    },
    objections: { A: 0.269, B: null, C: 0.596 },
    // Per buyer: which contender they chose, confidence, and their appeal +
    // objection toward every contender (including the ones they rejected).
    // All real, all from the same captured round.
    decisions: {
      b1: { choice: "C", confidence: 0.46, byBrand: { A: { appeal: 0.79, objection: "relevance" }, B: { appeal: 0.70, objection: "relevance" }, C: { appeal: 0.827, objection: "price" } } },
      b2: { choice: "A", confidence: 0.50, byBrand: { A: { appeal: 0.773, objection: "relevance" }, B: { appeal: 0.633, objection: "relevance" }, C: { appeal: 0.66, objection: "price" } } },
      b3: { choice: "A", confidence: 0.53, byBrand: { A: { appeal: 0.733, objection: "relevance" }, B: { appeal: 0.653, objection: "relevance" }, C: { appeal: 0.637, objection: "price" } } },
      b4: { choice: "C", confidence: 0.75, byBrand: { A: { appeal: 0.503, objection: "trust" }, B: { appeal: 0.423, objection: "trust" }, C: { appeal: 0.837, objection: "trust" } } },
      b5: { choice: "B", confidence: 0.28, byBrand: { A: { appeal: 0.507, objection: "trust" }, B: { appeal: 0.717, objection: "trust" }, C: { appeal: 0.643, objection: "price" } } },
      b6: { choice: "C", confidence: 0.78, byBrand: { A: { appeal: 0.397, objection: "trust" }, B: { appeal: 0.587, objection: "trust" }, C: { appeal: 0.75, objection: "trust" } } },
      b7: { choice: "B", confidence: 0.93, byBrand: { A: { appeal: 0.31, objection: "price" }, B: { appeal: 0.887, objection: "price" }, C: { appeal: 0.287, objection: "price" } } },
      b8: { choice: "none", confidence: 0.25, byBrand: { A: { appeal: 0.39, objection: "price" }, B: { appeal: 0.51, objection: "price" }, C: { appeal: 0.183, objection: "price" } } },
      b9: { choice: "B", confidence: 0.67, byBrand: { A: { appeal: 0.56, objection: "price" }, B: { appeal: 0.64, objection: "price" }, C: { appeal: 0.403, objection: "price" } } },
      b10: { choice: "C", confidence: 0.45, byBrand: { A: { appeal: 0.58, objection: "trust" }, B: { appeal: 0.467, objection: "trust" }, C: { appeal: 0.62, objection: "none" } } },
      b11: { choice: "C", confidence: 0.50, byBrand: { A: { appeal: 0.543, objection: "trust" }, B: { appeal: 0.62, objection: "trust" }, C: { appeal: 0.77, objection: "price" } } },
      b12: { choice: "C", confidence: 0.43, byBrand: { A: { appeal: 0.797, objection: "none" }, B: { appeal: 0.573, objection: "none" }, C: { appeal: 0.847, objection: "price" } } },
    },
  },
  round2: {
    share: { A: 0.389, B: 0.129, C: 0.407, none: 0.075 },
    winner: "C",
    decisions: {
      b1: "C", b2: "A", b3: "A", b4: "C", b5: "C", b6: "C",
      b7: "B", b8: "A", b9: "A", b10: "C", b11: "C", b12: "C",
    },
  },
};

export const OBJ_LABEL = { price: "price feels too high", trust: "doesn't believe the claims", relevance: "doesn't fit their needs or habits", unclear: "doesn't understand the offer", none: "no real objection" };
