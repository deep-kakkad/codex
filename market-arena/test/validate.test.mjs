// Tests for the shared validation rules. These run in the same shape the browser
// uses them, which is the point: one rule set, one set of tests.
import assert from "node:assert/strict";
import { findTeamProblem, findPersonaProblem, LIMITS, PERSONA_LIMITS } from "../public/validate.js";

const team = (o = {}) => ({ brand: "Alpha", headline: "h", valueProp: "v", price: "$1", ...o });
const ok = [team(), team({ brand: "Beta" })];

assert.equal(findTeamProblem(ok), null);
console.log("ok  a complete pair of versions passes");

assert.equal(findTeamProblem([team()])?.message, "A round needs 2 to 4 versions.");
assert.equal(findTeamProblem(null)?.message, "A round needs 2 to 4 versions.");
console.log("ok  too few versions is caught, and so is a non-array");

/* The problem must point at a field, or the client cannot put the message on it. */
const missing = findTeamProblem([team({ headline: "  " }), team({ brand: "Beta" })]);
assert.deepEqual({ index: missing.index, field: missing.field }, { index: 0, field: "headline" });
assert.equal(missing.message, "Alpha is missing its headline.");
console.log("ok  a blank field reports its index and field, named by the user's own brand");

/* Falls back to a position only when there is no name to use. */
assert.equal(findTeamProblem([team({ brand: "", headline: "" }), team({ brand: "Beta" })]).message,
  "Version 1 is missing its name.");
console.log("ok  an unnamed version falls back to its position");

const long = findTeamProblem([team({ headline: "x".repeat(LIMITS.headline + 1) }), team({ brand: "Beta" })]);
assert.equal(long.field, "headline");
assert.match(long.message, /91 characters\. The limit is 90, so trim 1/);
console.log("ok  an over-length field reports both the actual length and the limit");

const dupe = findTeamProblem([team(), team()]);
assert.deepEqual({ index: dupe.index, field: dupe.field }, { index: 1, field: "brand" });
console.log("ok  duplicate names point at the second one, which is the one to change");

/* Buyers */
const buyer = (o = {}) => ({ id: "c1", name: "Ann", segment: "Seg", profile: "p", ...o });
assert.equal(findPersonaProblem(null), null, "omitted buyers means use the defaults, not an error");
assert.equal(findPersonaProblem(Array.from({ length: 4 }, (_, i) => buyer({ id: `c${i}` }))), null);
assert.match(findPersonaProblem([buyer()])?.message, /4 to 16 buyers/);

const bad = findPersonaProblem(Array.from({ length: 4 }, (_, i) => buyer({ id: `c${i}`, ...(i === 2 ? { profile: "" } : {}) })));
assert.deepEqual({ index: bad.index, field: bad.field }, { index: 2, field: "profile" });
assert.equal(bad.message, "Ann is missing a profile.");
console.log("ok  buyer problems report their index and field too");

assert.equal(PERSONA_LIMITS.maxPersonas, 16);
console.log("\nall validation tests passed");

/* ---- Optional fields -------------------------------------------------------- */
import { EXTRA_BY_KEY, extraKeysOf } from "../public/validate.js";

const withX = (o, x) => ({ ...team(o), extras: x });
assert.equal(findTeamProblem([withX({}, { cta: "Buy now" }), withX({ brand: "Beta" }, { cta: "Start free" })]), null);
console.log("\nok  matching optional fields on every version pass");

// A field on one version but not the other means the ads are different shapes.
const lopsided = findTeamProblem([withX({}, { cta: "Buy now" }), team({ brand: "Beta" })]);
assert.deepEqual({ index: lopsided.index, field: lopsided.field }, { index: 1, field: "extra:cta" });
assert.match(lopsided.message, /not a fair fight/);
console.log("ok  a field present on one version and missing on another is caught");

const blankX = findTeamProblem([withX({}, { cta: "Buy now" }), withX({ brand: "Beta" }, { cta: "   " })]);
assert.equal(blankX.index, 1);
assert.match(blankX.message, /missing its call to action/);
console.log("ok  a blank optional field is treated as missing, not as absent");

const longX = findTeamProblem([withX({}, { cta: "x".repeat(EXTRA_BY_KEY.cta.max + 1) }), withX({ brand: "Beta" }, { cta: "ok" })]);
assert.equal(longX.field, "extra:cta");
assert.match(longX.message, /The limit is 40/);
console.log("ok  optional fields carry their own length cap");

assert.deepEqual(extraKeysOf([withX({}, { cta: "a", visual: "b" })]), ["cta", "visual"]);
console.log("ok  enabled keys are reported in the declared order, not insertion order");
