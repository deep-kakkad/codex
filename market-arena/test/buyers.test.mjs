// Tests for "buyers from your own data": what is removed before the text is sent,
// and what survives the check that every quote is really from the user's text.
import assert from "node:assert/strict";
import { redact, verifyBuyers } from "../lib/buyers-from-data.js";

const r = redact("Call +91 98450 12345, mail riya.k@example.com, see www.shop.in/x. Order 2024-01-15 cost Rs 1,499.");
assert.equal(r.text, "Call [phone], mail [email], see [link] Order 2024-01-15 cost Rs 1,499.");
assert.equal(r.redactions, 3);
console.log("ok  emails, phone numbers and links are removed; dates and prices are not");

const src = "I hate running out of coffee on Monday mornings. The price is steep for what you get. Anand says it's too strong.";
const out = verifyBuyers([
  { name: "Asha", segment: "Busy", profile: "Works long hours and hates running out.", quotes: ["I hate running out of coffee on Monday mornings.", "I adore it"] },
  { name: "Bea", segment: "Busy", profile: "Another long enough profile here.", quotes: ["“I hate running out of coffee on Monday mornings.”"] },
  { name: "Anand", segment: "Taste", profile: "Finds cold brew too strong for them.", quotes: ["Anand says it's too strong."] },
  { name: "Cy", segment: "Price", profile: "An invented buyer with nothing real.", quotes: ["Totally made up line here"] },
], src);
assert.deepEqual(out.buyers.map((b) => b.name), ["Asha", "Kabir"], "an invented buyer and one left with only a shared line are dropped");
assert.equal(out.droppedQuotes, 2, "two lines were not exact excerpts");
assert.equal(out.sharedQuotes, 1, "a line backs one buyer only");
assert.equal(out.renamed, 1, "a name found in the text is replaced");
assert.deepEqual(out.buyers[0].quotes, ["I hate running out of coffee on Monday mornings."]);
console.log("ok  only exact, unshared excerpts survive; names from the data are replaced");
