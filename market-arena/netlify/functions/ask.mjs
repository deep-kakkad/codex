import { currentUser } from "../../lib/auth.js";
import { ensureUser, spend, refund, logAsk, balanceOf, COST } from "../../lib/account.js";
import { ask } from "../../lib/ask.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "Ask isn't configured on this deployment." }, { status: 503 });

  const text = await req.text();
  if (text.length > 120000) return Response.json({ error: "Request too large." }, { status: 413 });
  let body;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "The request wasn't valid JSON." }, { status: 400 }); }

  const q = typeof body.question === "string" ? body.question.trim() : "";
  if (!q) return Response.json({ error: "Ask a question first." }, { status: 400 });
  if (q.length > 500) return Response.json({ error: "Keep the question under 500 characters." }, { status: 400 });
  const round = body.round;
  if (!round?.brands?.length || !round?.customers?.length)
    return Response.json({ error: "That doesn't look like a round result." }, { status: 400 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to ask questions about a round." }, { status: 401 });
  await ensureUser(user);

  // Charge first, so two questions in flight cannot both spend the last credits.
  // If the model then fails, the charge is reversed rather than quietly kept.
  const after = await spend(user.id, "ask", body.roundId || null);
  if (after === null)
    return Response.json({
      error: `A question costs ${COST.ask} credits and you have ${await balanceOf(user.id)}.`,
      balance: await balanceOf(user.id), needed: COST.ask,
    }, { status: 402 });

  try {
    const out = await ask(round, q);
    await logAsk(user.id, body.roundId || null, q, out, null).catch(() => {});
    return Response.json({ ...out, balance: after, charged: COST.ask });
  } catch (e) {
    console.error(e);
    const back = await refund(user.id, "ask", body.roundId || null, `Model call failed: ${String(e.message).slice(0, 120)}`).catch(() => after);
    await logAsk(user.id, body.roundId || null, q, null, String(e.message).slice(0, 300)).catch(() => {});
    return Response.json({ error: "Couldn't reach the model, so nothing was charged. Try again.", balance: back }, { status: 502 });
  }
};
export const config = { path: "/api/ask" };
