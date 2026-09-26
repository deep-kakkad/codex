import { currentUser } from "../../lib/auth.js";
import { ensureUser, spend, refund, balanceOf, COST } from "../../lib/account.js";
import { draftBuyers, TEXT_MIN, TEXT_MAX } from "../../lib/buyers-from-data.js";
import { PERSONA_LIMITS } from "../../public/validate.js";

// Buyers from your own data. Charged at the Ask rate and recorded in the ledger as
// an "ask" with a buyers: reference, so it needs no schema change. The pasted text is
// used for this one request and not written anywhere, not even to the log.
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "Drafting buyers isn't configured on this deployment." }, { status: 503 });

  const raw = await req.text();
  if (raw.length > TEXT_MAX + 4000) return Response.json({ error: `Paste up to ${TEXT_MAX.toLocaleString()} characters at a time.` }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "The request wasn't valid JSON." }, { status: 400 }); }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < TEXT_MIN) return Response.json({ error: "Paste a bit more first. A few reviews or a page of notes is the minimum to build buyers from." }, { status: 400 });
  if (text.length > TEXT_MAX) return Response.json({ error: `Paste up to ${TEXT_MAX.toLocaleString()} characters at a time.` }, { status: 413 });
  const L = PERSONA_LIMITS;
  const count = Math.max(L.minPersonas, Math.min(L.maxPersonas, Number.parseInt(body.count, 10) || 8));
  const segments = Array.isArray(body.segments)
    ? [...new Set(body.segments.filter((x) => typeof x === "string").map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 6)
    : [];
  const market = typeof body.market === "string" ? body.market.trim().slice(0, 400) : "";

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to draft buyers from your data." }, { status: 401 });
  await ensureUser(user);

  const ref = `buyers:${(market.split("\n")[0] || "your data").slice(0, 60)}`;
  const after = await spend(user.id, "ask", ref);
  if (after === null) {
    const balance = await balanceOf(user.id);
    return Response.json({ error: `Drafting buyers costs ${COST.ask} credits and you have ${balance}.`, balance, needed: COST.ask }, { status: 402 });
  }

  try {
    const out = await draftBuyers({ text, count, segments, market });
    // Nothing usable came back: that is a failed draft, so it is not charged.
    if (!out.buyers.length) throw Object.assign(new Error("no verified buyers"), { empty: true });
    return Response.json({ ...out, balance: after, charged: COST.ask });
  } catch (e) {
    console.error("buyers draft failed", e?.message);
    const back = await refund(user.id, "ask", ref, `Buyer draft failed: ${String(e.message).slice(0, 120)}`).catch(() => after);
    const timeout = /abort|timeout/i.test(String(e.name) + String(e.message));
    return Response.json({
      error: e.empty ? "Couldn't find distinct people in that text, so nothing was charged. Paste more, or notes with more detail about the customers."
        : timeout ? "Drafting took too long, so nothing was charged. Try again with less text."
        : "Couldn't draft the buyers, so nothing was charged. Try again in a moment.",
      balance: back,
    }, { status: 502 });
  }
};
export const config = { path: "/api/buyers" };
