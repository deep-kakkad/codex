// Public source research.
//
// One model call with live web search: it reads what reputable public sources say
// about a market (research papers, established news, recognised industry blogs,
// genuine social and forum discussion) and returns the buyer attitudes it found,
// each tied to the objection it maps to. Nothing here is stored. It is fetched when
// asked for and shown; the only piece that outlives the page is the short context
// list the buyers were given, which travels inside the round result like any other
// input to that round.
//
// Two rules keep it honest:
//  - A source is shown only if the search tool actually retrieved it. The model's
//    own list of links is not trusted on its own, because a model will write a
//    plausible URL for a page it never opened.
//  - Raw web text never reaches the buyers. They get at most a handful of short,
//    structured themes, each checked for embedded instructions first.

import { OBJECTIONS } from "./scenario.js";

const API = "https://api.openai.com/v1/responses";
export const RESEARCH_MODEL = process.env.RESEARCH_MODEL || "gpt-5.4-mini";

const OBJ_KEYS = Object.keys(OBJECTIONS);
const TYPES = ["paper", "news", "blog", "social", "report"];
export const CONTEXT_MAX = 6;
export const CONTEXT_TEXT_MAX = 220;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "themes", "sources"],
  properties: {
    summary: { type: "string" },
    themes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["theme", "objection", "weight", "evidence", "source_urls"],
        properties: {
          theme: { type: "string" },
          objection: { type: "string", enum: OBJ_KEYS },
          weight: { type: "number" },
          evidence: { type: "string" },
          source_urls: { type: "array", items: { type: "string" } },
        },
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "publisher", "type", "url", "date"],
        properties: {
          title: { type: "string" },
          publisher: { type: "string" },
          type: { type: "string", enum: TYPES },
          url: { type: "string" },
          date: { type: "string" },
        },
      },
    },
  },
};

const INSTRUCTIONS = `You research how real buyers think about a market, using live web search.

SOURCES
Use reputable public sources only:
- peer-reviewed or academic research, and reports from established research firms
- established news outlets and business press
- recognised industry publications and well-known practitioner blogs
- genuine social media and forum discussion (Reddit, X, LinkedIn, YouTube comments,
  community forums) — real people talking, not brand accounts
Skip SEO content farms, affiliate "best of" listicles, press releases dressed as
news, and anything you cannot attribute to a named publisher.
Search more than once and across more than one kind of source.

WHAT TO RETURN
- summary: three sentences at most on what buyers in this market care about and
  what holds them back.
- themes: 3 to 8 buyer attitudes, strongest first. For each:
  - theme: one sentence, written as what buyers think or do, in plain words.
    Do not name any specific brand or company; describe the category.
  - objection: the barrier it maps to. price = cost or value doubts; trust =
    doubts about claims, quality or safety; relevance = does not fit their habits
    or needs; unclear = confusion about what the product is; none = a positive
    pull that works in the product's favour.
  - weight: 0 to 1, how widely the sources support it. 0.8+ only when several
    independent sources agree.
  - evidence: one line saying what the sources actually found.
  - source_urls: the URLs of the pages that support it.
- sources: every page you relied on, with title, publisher, type (paper, news,
  blog, social or report), the exact URL you opened, and its date if shown
  (otherwise an empty string).

Report only what the sources say. If the evidence is thin, return fewer themes and
say so in the summary rather than filling space.`;

// What the search tool opened, as opposed to what the model says it read.
const norm = (u) => {
  try { const x = new URL(u); return (x.host.replace(/^www\./, "") + x.pathname).replace(/\/$/, "").toLowerCase(); }
  catch { return String(u || "").toLowerCase(); }
};

// The model sometimes inlines its citations as markdown, "([site](url))". The page
// links sources itself, so those are stripped rather than shown as raw brackets.
const clean = (s, max) => String(s ?? "")
  .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, "")
  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  .replace(/\s+/g, " ").trim().slice(0, max);
const clamp01 = (x) => (Number.isFinite(+x) ? Math.max(0, Math.min(1, +x)) : 0);
const httpUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

async function withRetry(fn, attempt = 0) {
  const res = await fn();
  if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    return withRetry(fn, attempt + 1);
  }
  return res;
}

// Turns the strongest themes into the lines the buyers see. Strength is said in words
// and counted from retrieved sources, not taken from the model's own weight: in
// testing it rated nearly everything above 0.7, which would call every theme
// "widely reported" and tell the buyers nothing about which ones really are.
export const strengthOf = (n) => (n >= 3 ? "reported across several sources" : n === 2 ? "reported by two sources" : "reported by one source");
export function contextFrom(themes) {
  return themes.slice(0, CONTEXT_MAX).map((t) => ({
    text: clean(`${t.theme} (${strengthOf(t.sources.length)})`, CONTEXT_TEXT_MAX),
    objection: t.objection,
    weight: t.weight,
  }));
}

export async function research({ topic, brief = "", segments = [] }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("no-key");
  const started = Date.now();

  const input = [
    `Market: ${topic}`,
    brief ? `What is going on: ${brief}` : "",
    segments.length ? `Buyer groups we care about: ${segments.join("; ")}` : "",
  ].filter(Boolean).join("\n");

  // One deadline for every attempt together: the function hosting this has 60 seconds
  // in total and the instruction check still has to run after it.
  const deadline = AbortSignal.timeout(45000);
  const res = await withRetry(() => fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: RESEARCH_MODEL,
      instructions: INSTRUCTIONS,
      input,
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      text: { format: { type: "json_schema", name: "market_research", strict: true, schema: SCHEMA } },
      max_output_tokens: 4000,
    }),
    signal: deadline,
  }));

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(body?.error?.message || `OpenAI returned ${res.status}`);
    e.status = res.status;
    throw e;
  }

  const output = body.output || [];
  const text = output.filter((o) => o.type === "message").flatMap((o) => o.content || [])
    .filter((c) => c.type === "output_text").map((c) => c.text).join("");
  let raw;
  try { raw = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()); }
  catch { throw new Error("The research came back in a shape we couldn't read."); }

  const calls = output.filter((o) => o.type === "web_search_call");
  const retrieved = new Set(calls.flatMap((o) => o.action?.sources || []).map((s) => norm(s.url)).filter(Boolean));
  // Citations inside the answer text are also pages the tool opened.
  output.filter((o) => o.type === "message").flatMap((o) => o.content || [])
    .flatMap((c) => c.annotations || []).filter((a) => a.type === "url_citation")
    .forEach((a) => retrieved.add(norm(a.url)));

  const listed = Array.isArray(raw.sources) ? raw.sources : [];
  const seen = new Set();
  const sources = [];
  for (const s of listed) {
    const url = httpUrl(s?.url);
    if (!url || !retrieved.has(norm(url)) || seen.has(norm(url))) continue;
    seen.add(norm(url));
    sources.push({
      title: clean(s.title, 200) || new URL(url).host,
      publisher: clean(s.publisher, 80) || new URL(url).host.replace(/^www\./, ""),
      type: TYPES.includes(s.type) ? s.type : "blog",
      url,
      date: clean(s.date, 40),
    });
    if (sources.length >= 20) break;
  }
  // Theme links are matched loosely (host and path) but always emitted as the exact
  // URL in the source list, so the page can number them consistently.
  const canonical = new Map(sources.map((s) => [norm(s.url), s.url]));

  // A theme survives only if at least one of its sources did. An attitude the model
  // cannot point to a retrieved page for is an assertion, not research.
  const themes = (Array.isArray(raw.themes) ? raw.themes : [])
    .map((t) => ({
      theme: clean(t?.theme, 200),
      objection: OBJ_KEYS.includes(t?.objection) ? t.objection : "none",
      weight: Math.round(clamp01(t?.weight) * 100) / 100,
      evidence: clean(t?.evidence, 300),
      sources: [...new Set((t?.source_urls || []).map(httpUrl).filter((u) => u && canonical.has(norm(u))).map((u) => canonical.get(norm(u))))],
    }))
    .filter((t) => t.theme && t.sources.length)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);

  const u = body.usage || {};
  return {
    topic,
    summary: clean(raw.summary, 600),
    themes,
    sources,
    dropped: listed.length - sources.length,
    searches: calls.length,
    model: body.model || RESEARCH_MODEL,
    ms: Date.now() - started,
    inputTokens: u.input_tokens ?? null,
    cachedTokens: u.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: u.output_tokens ?? null,
    researchedAt: new Date().toISOString(),
    context: contextFrom(themes),
  };
}
