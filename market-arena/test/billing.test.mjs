// Offline tests for billing: the webhook signature and which sessions earn credits.
// Run: node test/billing.test.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
const { verifyStripeSignature, creditsForSession, PACKS } = await import("../lib/billing.js");

const secret = "whsec_test";
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const now = Date.now();
const t = Math.floor(now / 1000);
const sign = (payload, ts = t, key = secret) => crypto.createHmac("sha256", key).update(`${ts}.${payload}`).digest("hex");

assert.equal(verifyStripeSignature(body, `t=${t},v1=${sign(body)}`, secret, 300, now), true);
console.log("ok  a correctly signed event is accepted");
assert.equal(verifyStripeSignature(body + " ", `t=${t},v1=${sign(body)}`, secret, 300, now), false);
console.log("ok  a body changed after signing is refused");
assert.equal(verifyStripeSignature(body, `t=${t},v1=${sign(body, t, "whsec_other")}`, secret, 300, now), false);
console.log("ok  a signature made with another secret is refused");
assert.equal(verifyStripeSignature(body, `t=${t - 3600},v1=${sign(body, t - 3600)}`, secret, 300, now), false);
console.log("ok  an old, replayed event is refused");
assert.equal(verifyStripeSignature(body, `t=${t},v0=${sign(body)}`, secret, 300, now), false);
assert.equal(verifyStripeSignature(body, null, secret, 300, now), false);
console.log("ok  a missing or wrong-scheme signature is refused");

const good = { id: "cs_1", payment_status: "paid", currency: "usd", amount_total: PACKS.small.cents, client_reference_id: "u1", metadata: { pack: "small" } };
assert.deepEqual(creditsForSession(good), { userId: "u1", credits: PACKS.small.credits, label: PACKS.small.label });
console.log("ok  a paid session earns its pack's credits");
assert.equal(creditsForSession({ ...good, payment_status: "unpaid" }), null);
assert.equal(creditsForSession({ ...good, amount_total: 1 }), null);
assert.equal(creditsForSession({ ...good, currency: "eur" }), null);
assert.equal(creditsForSession({ ...good, metadata: { pack: "huge" } }), null);
console.log("ok  unpaid, underpaid, wrong-currency and unknown-pack sessions earn nothing");
console.log("\nall billing tests passed");
