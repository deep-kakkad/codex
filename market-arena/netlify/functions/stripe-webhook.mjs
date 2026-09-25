import { verifyStripeSignature, creditsForSession } from "../../lib/billing.js";
import { creditTopup } from "../../lib/account.js";

// Stripe tells us a payment went through. The signature is checked against the raw
// body before anything is parsed or trusted, and credits are granted at most once
// per Checkout Session however many times Stripe retries.
export default async (req) => {
  if (req.method !== "POST") return new Response("Use POST.", { status: 405 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured.", { status: 503 });
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret))
    return new Response("Bad signature.", { status: 400 });

  let event;
  try { event = JSON.parse(raw); } catch { return new Response("Bad body.", { status: 400 }); }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded")
    return new Response("Ignored.", { status: 200 });

  const session = event.data?.object;
  const grant = creditsForSession(session);
  if (!grant) return new Response("Nothing to credit.", { status: 200 });
  try {
    await creditTopup(grant.userId, grant.credits, session.id, `Bought ${grant.label}`);
    return new Response("Credited.", { status: 200 });
  } catch (e) {
    // A non-2xx makes Stripe retry, which is what we want if the database blinked.
    console.error(e);
    return new Response("Try again.", { status: 500 });
  }
};
export const config = { path: "/api/stripe-webhook" };
