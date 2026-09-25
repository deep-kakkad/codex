// Offline tests for public research. The OpenAI call is stubbed with a response in
// the shape the Responses API returns, so these cost nothing.
// Run: node test/research.test.mjs
import assert from "node:assert/strict";

process.env.OPENAI_API_KEY = "test-key";
const { research } = await import("../lib/research.js");

const modelJson = {
  summary: "Buyers like it ([example.com](https://example.com/a)) but find it pricey.",
  themes: [
    { theme: "Price is the main barrier", objection: "price", weight: 0.9, evidence: "Several threads say so.", source_urls: ["https://www.example.com/a/", "https://news.test/b"] },
    { theme: "Invented attitude", objection: "trust", weight: 0.95, evidence: "Nothing retrieved backs this.", source_urls: ["https://made-up.test/x"] },
    { theme: "Convenience pulls people in", objection: "none", weight: 0.4, evidence: "One article.", source_urls: ["https://news.test/b"] },
  ],
  sources: [
    { title: "A", publisher: "Example", type: "social", url: "https://example.com/a", date: "2026" },
    { title: "B", publisher: "News", type: "news", url: "https://news.test/b", date: "" },
    { title: "X", publisher: "Nowhere", type: "blog", url: "https://made-up.test/x", date: "" },
  ],
};
let sent = null;
globalThis.fetch = async (_url, opts) => {
  sent = JSON.parse(opts.body);
  return {
    ok: true, status: 200,
    json: async () => ({
      model: "stub",
      usage: { input_tokens: 1000, output_tokens: 200 },
      output: [
        { type: "web_search_call", action: { sources: [{ url: "https://example.com/a" }, { url: "https://news.test/b?utm=1" }] } },
        { type: "message", content: [{ type: "output_text", text: JSON.stringify(modelJson), annotations: [] }] },
      ],
    }),
  };
};

const r = await research({ topic: "test market", segments: ["A"] });

assert.deepEqual(sent.tools, [{ type: "web_search" }], "web search is switched on");
assert.equal(sent.text.format.type, "json_schema", "structured output is requested");
console.log("ok  one call, with web search and a JSON schema");

assert.deepEqual(r.sources.map((s) => s.url), ["https://example.com/a", "https://news.test/b"]);
assert.equal(r.dropped, 1, "the link the search never opened is counted as dropped");
console.log("ok  a source the search tool never opened is not shown");

assert.deepEqual(r.themes.map((t) => t.theme), ["Price is the main barrier", "Convenience pulls people in"]);
console.log("ok  a finding with no retrieved source behind it is dropped, however confident");

assert.deepEqual(r.themes[0].sources, ["https://example.com/a", "https://news.test/b"], "theme links use the exact listed URL");
console.log("ok  theme links resolve to the numbered source list");

assert.ok(!r.summary.includes("]("), `markdown citations stripped: ${r.summary}`);
console.log("ok  inline markdown citations are removed from prose");

assert.deepEqual(r.context.map((c) => c.text), [
  "Price is the main barrier (reported by two sources)",
  "Convenience pulls people in (reported by one source)",
]);
console.log("ok  buyers get short lines whose strength is counted from sources");

console.log("\nall research tests passed");
