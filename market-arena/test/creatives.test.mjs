// Creatives: the image check, the description's fixed shape, the all-or-none rule,
// and that the buyers get the description while the result carries it back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readImage, cleanDescription, CREATIVE_FIELDS } from "../lib/creatives.js";
import { findTeamProblem } from "../public/validate.js";
import { adParts } from "../public/ad-parts.js";

const PNG = "data:image/png;base64," + Buffer.from("\x89PNG fake bytes for hashing").toString("base64");
const desc = { words_on_image: "Never drink stale coffee again / ₹749/mo", shows: "A glass bottle of cold brew on ice next to coffee beans.", setting: "plain studio background",
  product_visible: "yes, prominently", text_amount: "a little", main_colours: "teal, white, brown", layout: "headline across the top, bottle centred" };
const team = (brand, creative) => ({ brand, headline: "h", valueProp: "v", price: "$1", ...(creative ? { creative } : {}) });

test("an image is accepted only as a JPG, PNG or WebP data URL, and hashes the same every time", () => {
  const a = readImage(PNG), b = readImage(PNG);
  assert.equal(a.id, b.id);
  assert.match(a.id, /^[a-f0-9]{32}$/);
  for (const bad of ["", "data:image/gif;base64,AAAA", "data:text/html;base64,PGh0bWw+", "https://example.com/a.png"]) {
    assert.throws(() => readImage(bad), (e) => e.user, bad);
  }
});

test("a description keeps its fixed shape and limits, and never invents an option", () => {
  const c = cleanDescription({ ...desc, shows: "x ".repeat(400), extra: "dropped", text_amount: "loads" });
  assert.deepEqual(Object.keys(c), CREATIVE_FIELDS.map((f) => f.key));
  assert.ok(c.shows.length <= 300);
  assert.equal(c.text_amount, "");
});

test("every version needs a creative or none do, and each must have been read", () => {
  assert.equal(findTeamProblem([team("A", { id: "a", description: desc }), team("B", { id: "b", description: desc })]), null);
  const lop = findTeamProblem([team("A", { id: "a", description: desc }), team("B")]);
  assert.equal(lop.field, "creative"); assert.match(lop.message, /B has no creative/);
  const unread = findTeamProblem([team("A", { id: "a", description: desc }), team("B", { id: "b", description: null })]);
  assert.match(unread.message, /hasn't been read yet/);
  const tampered = findTeamProblem([team("A", { id: "a", description: desc }), team("B", { id: "b", description: { ...desc, shows: "y".repeat(301) } })]);
  assert.match(tampered.message, /hasn't been read yet/);
});

test("the creative becomes one part of the ad buyers can name", () => {
  const parts = adParts({ headline: "h", valueProp: "One. Two.", price: "$1", creative: { description: desc } });
  const img = parts.find((p) => p.key === "image");
  assert.equal(img.label, "The image");
  assert.equal(img.text, desc.shows);
});

test("the engine sends the description to every buyer and returns it with the result", async () => {
  process.env.TYPESAFE_API_KEY = "test";
  const seen = [];
  globalThis.fetch = async (_u, o) => {
    const { state, questions } = JSON.parse(o.body);
    if (state.customer) seen.push(state.ads);
    const answers = {};
    for (const [k, q] of Object.entries(questions)) {
      if (k === "purchase") answers[k] = { choice: "t1", probabilities: { t1: 0.6, t2: 0.3, none: 0.1 }, confidence: 0.8 };
      else if (k.endsWith("__appeal")) answers[k] = { score: 2 };
      else if (k.endsWith("__objection") || k.endsWith("__pull") || k.endsWith("__push")) { const ks = Object.keys(q.criteria); answers[k] = { choice: ks[0], probabilities: Object.fromEntries(ks.map((x, i) => [x, i ? 0 : 1])) }; }
      else answers[k] = { noul: 0.4 };
    }
    return { ok: true, status: 200, json: async () => ({ answers }) };
  };
  const { runRound } = await import("../lib/engine.js");
  const personas = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, name: `B${i}`, segment: "S", profile: "p" }));
  const r = await runRound([team("A", { id: "abc123", description: desc }), team("B", { id: "def456", description: { ...desc, words_on_image: "" } })], personas);
  assert.ok(seen.length >= 4 && seen.every((ads) => ads.t1.image?.words_on_image === desc.words_on_image && "image" in ads.t2));
  assert.deepEqual(Object.keys(seen[0].t1.image), CREATIVE_FIELDS.map((f) => f.key));
  assert.equal(r.brands[0].creative.id, "abc123");
  assert.equal(r.brands[0].creative.description.shows, desc.shows);
  assert.ok(r.brands[0].parts.some((p) => p.key === "image"));
});
