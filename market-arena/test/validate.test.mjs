// Tests for the shared validation rules. These run in the same shape the browser
// uses them, which is the point: one rule set, one set of tests.
import assert from "node:assert/strict";
import { findTeamProblem, findPersonaProblem, LIMITS, PERSONA_LIMITS } from "../public/validate.js";

const team = (o = {}) => ({ brand: "Alpha", headline: "h", valueProp: "v", price: "$1", ...o });
const ok = [team(), team({ brand: "Beta" })];

assert.equal(findTeamProblem(ok), null);
console.log("ok  a complete pair of contenders passes");

assert.equal(findTeamProblem([team()])?.message, "Enter between 2 and 4 contenders.");
assert.equal(findTeamProblem(null)?.message, "Enter between 2 and 4 contenders.");
console.log("ok  too few contenders is caught, and so is a non-array");

/* The problem must point at a field, or the client cannot put the message on it. */
const missing = findTeamProblem([team({ headline: "  " }), team({ brand: "Beta" })]);
assert.deepEqual({ index: missing.index, field: missing.field }, { index: 0, field: "headline" });
assert.equal(missing.message, "Alpha is missing its headline.");
console.log("ok  a blank field reports its index and field, named by the user's own brand");

/* Falls back to a position only when there is no name to use. */
assert.equal(findTeamProblem([team({ brand: "", headline: "" }), team({ brand: "Beta" })]).message,
  "Contender 1 is missing its name.");
console.log("ok  an unnamed contender falls back to its position");

const long = findTeamProblem([team({ headline: "x".repeat(LIMITS.headline + 1) }), team({ brand: "Beta" })]);
assert.equal(long.field, "headline");
assert.match(long.message, /91 characters — the limit is 90/);
console.log("ok  an over-length field reports both the actual length and the limit");

const dupe = findTeamProblem([team(), team()]);
assert.deepEqual({ index: dupe.index, field: dupe.field }, { index: 1, field: "brand" });
console.log("ok  duplicate names point at the second one, which is the one to change");

/* Buyers */
const buyer = (o = {}) => ({ id: "c1", name: "Ann", segment: "Seg", profile: "p", ...o });
assert.equal(findPersonaProblem(null), null, "omitted buyers means use the defaults, not an error");
assert.equal(findPersonaProblem(Array.from({ length: 4 }, (_, i) => buyer({ id: `c${i}` }))), null);
assert.match(findPersonaProblem([buyer()])?.message, /between 4 and 16 buyers/);

const bad = findPersonaProblem(Array.from({ length: 4 }, (_, i) => buyer({ id: `c${i}`, ...(i === 2 ? { profile: "" } : {}) })));
assert.deepEqual({ index: bad.index, field: bad.field }, { index: 2, field: "profile" });
assert.equal(bad.message, "Ann is missing a profile.");
console.log("ok  buyer problems report their index and field too");

assert.equal(PERSONA_LIMITS.maxPersonas, 16);
console.log("\nall validation tests passed");
