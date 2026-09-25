// Credit packs and the Stripe plumbing behind top-ups.
//
// Nothing here can charge anyone until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
// are set. Without them the pricing and account pages show the packs as coming
// soon and /api/checkout refuses. Stripe is called over its REST API directly: the
// two calls needed (create a Checkout Session, verify a webhook) don't justify a
// dependency.
//
// Credits are only ever granted by the webhook, never by the success redirect. A
// redirect can be forged or replayed; a webhook is signed by Stripe.

import crypto from "node:crypto";

// Proposed prices, in US cents. One place to change them.
export const PACKS = {
  small: { credits: 200, cents: 500, label: "200 credits" },
  medium: { credits: 1000, cents: 2000, label: "1,000 credits" },
  large: { credits: 3000, cents: 5000, label: "3,000 credits" },
};
export const CURRENCY = "usd";

export const billingEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);

export const publicPacks = () => Object.entries(PACKS).map(([id, p]) => ({ id, ...p, currency: CURRENCY }));

export async function createCheckout({ packId, user, origin }) {
  const pack = PACKS[packId];
  if (!pack) throw Object.assign(new Error("unknown pack"), { status: 400 });
  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${origin}/account.html?paid=1`,
    cancel_url: `${origin}/account.html?cancelled=1`,
    client_reference_id: user.id,
    customer_email: user.email,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": CURRENCY,
    "line_items[0][price_data][unit_amount]": String(pack.cents),
    "line_items[0][price_data][product_data][name]": `Market Arena: ${pack.label}`,
    "metadata[user_id]": user.id,
    "metadata[pack]": packId,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw Object.assign(new Error(body?.error?.message || `Stripe returned ${res.status}`), { status: 502 });
  return { url: body.url, id: body.id };
}

// Stripe signs `${timestamp}.${rawBody}` with the endpoint secret (HMAC-SHA256) and
// sends it as `Stripe-Signature: t=...,v1=...`. Old timestamps are refused so a
// captured request can't be replayed later.
export function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = header.split(",").filter((kv) => kv.trim().startsWith("v1=")).map((kv) => kv.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// Which credits a completed Checkout Session is worth, checked against our own
// price list rather than trusted from the event.
export function creditsForSession(session) {
  const pack = PACKS[session?.metadata?.pack];
  if (!pack) return null;
  if (session.payment_status !== "paid") return null;
  if (session.currency !== CURRENCY || session.amount_total !== pack.cents) return null;
  const userId = session.client_reference_id || session.metadata?.user_id;
  if (!userId) return null;
  return { userId, credits: pack.credits, label: pack.label };
}
