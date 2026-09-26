import { currentUser } from "../../lib/auth.js";
import { ensureUser, spend, refund, balanceOf, COST } from "../../lib/account.js";
import { readImage, describeImage, cachedDescription, saveDescription, MAX_IMAGES, MAX_IMAGE_BYTES } from "../../lib/creatives.js";

// Reads uploaded creatives into descriptions the buyers can judge.
//
// Pricing: reading the new or changed creatives for a round costs the Ask rate
// (10 credits) once, however many images that is. An image this account has had read
// before comes back from the cache for free, so an unchanged creative never costs
// twice. Recorded as an "ask" with a creative: reference, so no schema change. If the
// reading fails, the credits go back. The images are not stored; only descriptions.
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "Reading creatives isn't configured on this deployment." }, { status: 503 });
  const raw = await req.text();
  if (raw.length > MAX_IMAGES * MAX_IMAGE_BYTES * 1.4 + 4000) return Response.json({ error: "Those images are too large. Try smaller ones." }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "The request wasn't valid JSON." }, { status: 400 }); }
  const list = Array.isArray(body.images) ? body.images : [];
  if (!list.length) return Response.json({ error: "Add an image first." }, { status: 400 });
  if (list.length > MAX_IMAGES) return Response.json({ error: `A round holds up to ${MAX_IMAGES} creatives.` }, { status: 400 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to test creatives." }, { status: 401 });
  await ensureUser(user);

  let images;
  try { images = list.map((x) => ({ dataUrl: x?.data, ...readImage(x?.data) })); }
  catch (e) { return Response.json({ error: e.user ? e.message : "Couldn't read one of those images." }, { status: e.status || 400 }); }

  // What this account has already had read comes back as it was.
  const found = await Promise.all(images.map((im) => cachedDescription(user.id, im.id).catch(() => null)));
  const todo = images.filter((_, i) => !found[i]);
  const unique = [...new Map(todo.map((im) => [im.id, im])).values()];
  if (!unique.length) {
    return Response.json({ descriptions: images.map((im, i) => ({ id: im.id, description: found[i].description })), charged: 0, balance: await balanceOf(user.id) });
  }

  const ref = `creative:${unique.length} image${unique.length === 1 ? "" : "s"}`;
  const after = await spend(user.id, "ask", ref);
  if (after === null) {
    const balance = await balanceOf(user.id);
    return Response.json({ error: `Reading creatives costs ${COST.ask} credits and you have ${balance}.`, balance, needed: COST.ask }, { status: 402 });
  }
  try {
    const read = await Promise.all(unique.map((im) => describeImage(im.dataUrl)));
    const byId = Object.fromEntries(unique.map((im, i) => [im.id, read[i].description]));
    await Promise.all(unique.map((im, i) => saveDescription(user.id, im.id, { description: read[i].description, model: read[i].model, at: Date.now() }).catch(() => {})));
    return Response.json({
      descriptions: images.map((im, i) => ({ id: im.id, description: found[i]?.description || byId[im.id] })),
      charged: COST.ask, balance: after, read: unique.length,
    });
  } catch (e) {
    console.error("creative read failed", e?.message);
    const back = await refund(user.id, "ask", ref, `Creative read failed: ${String(e.message).slice(0, 120)}`).catch(() => after);
    const timeout = /abort|timeout/i.test(String(e.name) + String(e.message));
    return Response.json({
      error: timeout ? "Reading the images took too long, so nothing was charged. Try again." : "Couldn't read the images, so nothing was charged. Try again in a moment.",
      balance: back,
    }, { status: 502 });
  }
};
export const config = { path: "/api/creatives" };
