import { currentUser } from "../../lib/auth.js";
import { ensureUser, spend, refund, logAsk, balanceOf, COST } from "../../lib/account.js";
import { research } from "../../lib/research.js";
import { checkContext } from "../../lib/engine.js";

// Public source research. Charged at the Ask rate and recorded in the ledger as an
// "ask" with a research: reference, so it needs no schema change. The research itself
// is returned and forgotten — nothing here writes it anywhere.
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "Research isn't configured on this deployment." }, { status: 503 });

  const text = await req.text();
  if (text.length > 4000) return Response.json({ error: "Request too large." }, { status: 413 });
  let body;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "The request wasn't valid JSON." }, { status: 400 }); }

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (topic.length < 3) return Response.json({ error: "Say what market to research first." }, { status: 400 });
  if (topic.length > 160) return Response.json({ error: "Keep the market description under 160 characters." }, { status: 400 });
  const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 600) : "";
  const segments = Array.isArray(body.segments)
    ? [...new Set(body.segments.filter((x) => typeof x === "string").map((x) => x.trim().slice(0, 60)).filter(Boolean))].slice(0, 8)
    : [];

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to run research." }, { status: 401 });
  await ensureUser(user);

  const ref = `research:${topic.slice(0, 80)}`;
  const after = await spend(user.id, "ask", ref);
  if (after === null) {
    const balance = await balanceOf(user.id);
    return Response.json({ error: `Research costs ${COST.ask} credits and you have ${balance}.`, balance, needed: COST.ask }, { status: 402 });
  }

  try {
    const out = await research({ topic, brief, segments });
    // Screen what the buyers would read. If the screen itself cannot run, nothing
    // unscreened is offered to them: the research still shows, it just can't be used.
    let context = [];
    let screened = false;
    if (process.env.TYPESAFE_API_KEY && out.context.length) {
      try {
        context = (await checkContext(out.context)).filter((c) => !c.flagged).map(({ flagged, ...c }) => c);
        screened = true;
      } catch (e) { console.error("context screen failed", e); }
    }
    const note = `${out.themes.length} themes, ${out.sources.length} sources, ${out.searches} searches`;
    await logAsk(user.id, null, `research: ${topic}`, { ...out, answer: note }, null).catch(() => {});
    return Response.json({
      ...out,
      context: { topic, researchedAt: out.researchedAt, items: context },
      screened,
      withheld: out.context.length - context.length,
      balance: after, charged: COST.ask,
    });
  } catch (e) {
    console.error(e);
    const back = await refund(user.id, "ask", ref, `Research failed: ${String(e.message).slice(0, 120)}`).catch(() => after);
    await logAsk(user.id, null, `research: ${topic}`, null, String(e.message).slice(0, 300)).catch(() => {});
    const timeout = /abort|timeout/i.test(String(e.name) + String(e.message));
    return Response.json({
      error: timeout ? "The search took too long, so nothing was charged. Try again, or narrow the market description."
                     : "Couldn't finish the research, so nothing was charged. Try again in a moment.",
      balance: back,
    }, { status: 502 });
  }
};
export const config = { path: "/api/research" };
