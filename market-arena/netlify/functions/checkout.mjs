import { currentUser } from "../../lib/auth.js";
import { ensureUser } from "../../lib/account.js";
import { billingEnabled, createCheckout, PACKS } from "../../lib/billing.js";

// Starts a Stripe Checkout for one credit pack. The credits themselves arrive via
// the webhook once Stripe confirms the payment, never from this request.
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  if (!billingEnabled()) return Response.json({ error: "Buying credits isn't open yet." }, { status: 503 });
  let body;
  try { body = JSON.parse(await req.text()); } catch { return Response.json({ error: "The request wasn't valid JSON." }, { status: 400 }); }
  if (!PACKS[body?.pack]) return Response.json({ error: "Pick one of the credit packs." }, { status: 400 });
  const user = await currentUser().catch(() => null);
  if (!user) return Response.json({ error: "Sign in to buy credits." }, { status: 401 });
  try {
    await ensureUser(user);
    const { url } = await createCheckout({ packId: body.pack, user, origin: new URL(req.url).origin });
    return Response.json({ url });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't start the payment. Try again in a moment." }, { status: 502 });
  }
};
export const config = { path: "/api/checkout" };
