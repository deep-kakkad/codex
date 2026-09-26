import { currentUser } from "../../lib/auth.js";
import { ensureUser, spend, refund, balanceOf, COST } from "../../lib/account.js";
import { fetchPage, readPage, extractVersion, TEXT_MIN } from "../../lib/from-page.js";

// Start a version from a web page. Reading the page is free; turning it into a
// version is one model call, charged at the round rate (1 credit) and recorded as a
// "round" with a page: reference, so it needs no schema change. Refunded if nothing
// usable comes back. The page is read for this request only and not stored.
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "Reading pages isn't configured on this deployment." }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 4000) return Response.json({ error: "Request too large." }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "The request wasn't valid JSON." }, { status: 400 }); }

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to fill a version from a web page." }, { status: 401 });
  await ensureUser(user);

  // Fetch and read first: a page that can't be read costs nothing.
  let url, page;
  try {
    const got = await fetchPage(body.url);
    url = got.url;
    page = readPage(got.html);
  } catch (e) {
    if (e.user) return Response.json({ error: e.message }, { status: e.status || 400 });
    console.error("page fetch failed", e?.message);
    return Response.json({ error: "Couldn't read that page." }, { status: 502 });
  }
  if (page.text.length < TEXT_MIN && !page.description) {
    return Response.json({ error: "That page has almost no text for us to read; it may build itself in the browser. Paste its copy into the fields instead. Nothing was charged." }, { status: 422 });
  }

  const host = new URL(url).hostname.replace(/^www\./, "");
  const ref = `page:${host}`.slice(0, 80);
  const after = await spend(user.id, "round", ref);
  if (after === null) {
    const balance = await balanceOf(user.id);
    return Response.json({ error: `Reading a page costs ${COST.round} credit and you have ${balance}.`, balance, needed: COST.round }, { status: 402 });
  }
  try {
    const out = await extractVersion({ url, page });
    if (!out.fields.headline && !out.fields.valueProp) throw Object.assign(new Error("no message"), { empty: true });
    return Response.json({ url, host, ...out, balance: after, charged: COST.round });
  } catch (e) {
    console.error("page extract failed", e?.message);
    const back = await refund(user.id, "round", ref, `Page read failed: ${String(e.message).slice(0, 120)}`).catch(() => after);
    return Response.json({
      error: e.empty ? "Couldn't find a headline or value proposition on that page, so nothing was charged. Try the page's main address, or paste its copy."
        : "Couldn't read the message on that page, so nothing was charged. Try again in a moment.",
      balance: back,
    }, { status: 502 });
  }
};
export const config = { path: "/api/from-page" };
