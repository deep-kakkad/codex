// Practice rounds need an account: free, but not anonymous.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.TYPESAFE_API_KEY = "test-key";
const { prepareRound } = await import("../lib/handlers.js");
const { TEMPLATES } = await import("../lib/templates.js");

const t = TEMPLATES.find((x) => x.id !== "blank");
const body = JSON.stringify({ mode: "practice", teams: t.defaultTeams, personas: t.personas.slice(0, 8) });

test("a signed-out practice round is refused with a sign-in hint", () => {
  const prep = prepareRound(body, null, "1.2.3.4", null);
  assert.equal(prep.error?.[0], 401);
  assert.equal(prep.error[1].signIn, true);
  assert.match(prep.error[1].error, /Sign in/);
});

test("a signed-in practice round is prepared", () => {
  const prep = prepareRound(body, null, "1.2.3.4", { id: "u1", email: "a@b.c" });
  assert.equal(prep.error, undefined);
  assert.equal(typeof prep.run, "function");
});

test("the hourly limit counts per account, not per connection", () => {
  const user = { id: "u-limit", email: "l@b.c" };
  for (let i = 0; i < 20; i++) assert.equal(prepareRound(body, null, `10.0.0.${i}`, user).error, undefined);
  assert.equal(prepareRound(body, null, "10.0.0.99", user).error?.[0], 429);
  assert.equal(prepareRound(body, null, "10.0.0.99", { id: "someone-else", email: "x@y.z" }).error, undefined);
});
