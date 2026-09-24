// Ask Market Arena.
//
// The one place in this product that generates prose. Everything else returns
// typed decisions from Jev; this answers questions about a round in English, which
// needs a generative model, which is why it is the only thing that costs real money
// per use and the only thing metered in credits.
//
// The whole design problem is grounding. A model given a report will happily answer
// questions the report cannot support, and a confident wrong answer about your
// market is worse than no answer. So: it sees only this round, it is told to refuse
// rather than reach, and every question and answer is logged so that instinct can be
// checked against real traffic instead of trusted.

const API = "https://api.openai.com/v1/chat/completions";
export const ASK_MODEL = process.env.ASK_MODEL || "gpt-5.4-mini";
export const ASK_COST_CREDITS = 10;

const SYSTEM = `You answer questions about one Market Arena simulation round.

WHAT THE DATA IS
Buyers here are simulated by a decision model, not surveyed. Each buyer answered
five typed questions per version: would they notice it, how appealing is it, do
they believe it, what is their biggest objection, and which would they buy. There
are no free-text responses and no quotes. Never invent a buyer's words or reasons.

TWO DIFFERENT NUMBERS, NEVER CONFLATE THEM
- share: average choice probability across all buyers. A buyer leaning 40/35/25
  contributes to all three, so these sum to about 1.
- picks: how many buyers had it as their single top choice.
They disagree on purpose. Say which one you are quoting, every time.

HOW TO ANSWER
- Use only the round below. Quote its actual figures.
- Be brief. Three sentences unless the question needs more.
- A gap under 5 points is not a result: identical re-runs move share by about a
  point, so call small gaps too close to separate.
- Segments hold 2 to 4 buyers each. Treat any segment-level claim as indicative
  and say so.
- If a figure you need is not present in the data below, say it is not there.
  Never estimate it, never infer it from a related figure, never state a number
  you did not read. An invented figure is the worst thing you can produce.

WHEN TO REFUSE
If the question cannot be answered from this round, say so plainly in one sentence
and say what would answer it. Do this for anything about real-world outcomes,
other markets, other time periods, competitors not in the round, revenue, or what
real customers would do. Do not guess, do not extrapolate, do not hedge your way
into an answer. Refusing is the correct response, not a failure.`;

// Older rounds predate the engine returning counts. An absent field is the one thing
// this model reliably gets wrong: asked about picks when the key was missing, it
// invented a number rather than saying it did not have one. So derive what can be
// derived, and never hand it a half-populated object.
const panelOf = (r) => r.panel ?? r.customers.length;
const picksOf = (r, id) => {
  const src = id === "none" ? r.noPurchase : r.brands.find((b) => b.id === id);
  return src?.picks ?? r.customers.filter((c) => c.purchase === id).length;
};

// The model does not need every field, and a smaller payload is a cheaper question.
export function reportFor(round) {
  return {
    goal: round.goal || null,
    goalNote: round.goalNote || null,
    panel: panelOf(round),
    segments: round.segments,
    versions: round.brands.map((b) => ({
      name: b.brand, headline: b.headline, valueProp: b.valueProp, price: b.price,
      ...(b.extras && Object.keys(b.extras).length ? { extraFields: b.extras } : {}),
      share: b.share, picks: picksOf(round, b.id), funnel: b.funnel,
      bySegment: b.bySegment, objections: b.objections,
    })),
    boughtNothing: { share: round.noPurchase.share, picks: picksOf(round, "none") },
    buyers: round.customers.map((c) => ({
      name: c.name, segment: c.segment, profile: c.profile,
      chose: c.purchase, probabilities: c.purchaseProbs,
      perVersion: c.byBrand,
    })),
  };
}

// 502/504 from the gateway is transient and common enough to be worth one retry.
async function withRetry(fn, attempt = 0) {
  const res = await fn();
  if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
    return withRetry(fn, attempt + 1);
  }
  return res;
}

export async function ask(round, question) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("no-key");
  const started = Date.now();

  const res = await withRetry(() => fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ASK_MODEL,
      messages: [
        // The report goes first and never changes within a session, so it sits in the
        // cacheable prefix and follow-up questions cost a fraction of the first.
        { role: "system", content: SYSTEM },
        { role: "system", content: "ROUND DATA\n" + JSON.stringify(reportFor(round)) },
        { role: "user", content: question },
      ],
      max_completion_tokens: 700,
    }),
  }));

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(body?.error?.message || `OpenAI returned ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const u = body.usage || {};
  return {
    answer: body.choices?.[0]?.message?.content?.trim() || "",
    model: body.model || ASK_MODEL,
    ms: Date.now() - started,
    inputTokens: u.prompt_tokens ?? null,
    cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: u.completion_tokens ?? null,
  };
}
