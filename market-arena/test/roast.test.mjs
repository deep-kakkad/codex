// Roast my ad: the checks and the two daily limits. No model calls.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ROAST_PER_IP = "3";
process.env.ROAST_DAILY_CAP = "5";
process.env.TYPESAFE_API_KEY = "test-key";
const { cleanRoast, takeRoast, prepareRoast, resetMeter, ROAST_PANELS } = await import("../lib/roast.js");

const ad = { headline: "Dinner's done in 15 minutes", valueProp: "Meal kits with everything pre-chopped." };

test("a roast needs a headline and body copy; name and price are optional", () => {
  assert.equal(cleanRoast({ ad: { valueProp: "x" } }).problem.field, "headline");
  assert.equal(cleanRoast({ ad: { headline: "x" } }).problem.field, "valueProp");
  const ok = cleanRoast({ ad });
  assert.equal(ok.ad.brand, "This brand");
  assert.equal(ok.ad.price, "Not stated in the ad");
  assert.equal(ok.panel, "people");
  assert.equal(cleanRoast({ ad, panel: "business" }).panel, "business");
  assert.equal(cleanRoast({ ad, panel: "anything" }).panel, "people");
});

test("limits are the round limits", () => {
  const p = cleanRoast({ ad: { ...ad, headline: "x".repeat(91) } }).problem;
  assert.equal(p.field, "headline");
  assert.match(p.message, /limit is 90/);
});

test("both panels have eight buyers in four groups of two", () => {
  for (const panel of Object.values(ROAST_PANELS)) {
    assert.equal(panel.length, 8);
    const groups = {};
    panel.forEach((p) => (groups[p.segment] = (groups[p.segment] || 0) + 1));
    assert.deepEqual(Object.values(groups), [2, 2, 2, 2]);
  }
});

test("three roasts a day per connection, then a polite no", async () => {
  resetMeter();
  for (let i = 0; i < 3; i++) assert.equal((await takeRoast("1.1.1.1")).ok, true);
  const no = await takeRoast("1.1.1.1");
  assert.equal(no.ok, false); assert.equal(no.reason, "ip");
});

test("the whole site stops at the daily cap", async () => {
  resetMeter();
  for (let i = 0; i < 5; i++) assert.equal((await takeRoast(`2.2.2.${i}`)).ok, true);
  const no = await takeRoast("3.3.3.3");
  assert.equal(no.ok, false); assert.equal(no.reason, "cap");
});

test("a bad request is refused before it counts against the limit", async () => {
  resetMeter();
  const bad = await prepareRoast(JSON.stringify({ ad: { headline: "" } }), "4.4.4.4");
  assert.equal(bad.error[0], 400);
  assert.equal(bad.error[1].field, "headline");
  for (let i = 0; i < 3; i++) assert.equal(typeof (await prepareRoast(JSON.stringify({ ad }), "4.4.4.4")).run, "function");
  const limited = await prepareRoast(JSON.stringify({ ad }), "4.4.4.4");
  assert.equal(limited.error[0], 429);
  assert.match(limited.error[1].error, /free project/);
});
