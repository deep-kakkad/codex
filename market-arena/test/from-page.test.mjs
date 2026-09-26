import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUrl, isPrivateAddress, readPage, checkFields, fetchPage, decode } from "../lib/from-page.js";

test("only public http(s) addresses on standard ports are accepted", () => {
  assert.equal(checkUrl("example.com/pricing").href, "https://example.com/pricing");
  assert.equal(checkUrl("http://shop.example.co.uk/#top").href, "http://shop.example.co.uk/");
  for (const bad of ["", "ftp://example.com", "file:///etc/passwd", "http://localhost:3000", "http://intranet", "http://printer.local",
    "http://127.0.0.1", "http://10.0.0.5/x", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://user:pw@example.com",
    "https://example.com:8443/", "http://192.168.1.1", "http://metadata.google.internal"]) {
    assert.throws(() => checkUrl(bad), (e) => e.user, bad);
  }
});

test("private, loopback, link-local and mapped addresses are recognised", () => {
  for (const ip of ["10.1.2.3", "127.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "224.0.0.1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip);
});

test("a redirect to a private address is refused", async () => {
  const hops = [];
  const fetchImpl = async (u) => { hops.push(String(u)); return new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest" } }); };
  await assert.rejects(fetchPage("https://example.com", { fetchImpl, resolve: async () => {} }), (e) => e.user && /public/.test(e.message));
  assert.deepEqual(hops, ["https://example.com/"]);
});

test("a redirect whose host resolves privately is refused before it is fetched", async () => {
  const fetched = [];
  const fetchImpl = async (u) => { fetched.push(String(u)); return new Response("", { status: 301, headers: { location: "https://sneaky.example.net/" } }); };
  const resolve = async (u) => { if (u.hostname === "sneaky.example.net") throw Object.assign(new Error("That address isn't a public web page."), { user: true }); };
  await assert.rejects(fetchPage("https://example.com", { fetchImpl, resolve }), (e) => e.user);
  assert.deepEqual(fetched, ["https://example.com/"]);
});

test("non-html responses and logins are refused with a reason", async () => {
  const pdf = async () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } });
  await assert.rejects(fetchPage("https://example.com/a.pdf", { fetchImpl: pdf, resolve: async () => {} }), /isn't a web page/);
  const denied = async () => new Response("no", { status: 403 });
  await assert.rejects(fetchPage("https://example.com", { fetchImpl: denied, resolve: async () => {} }), /login|blocks/);
});

test("a page is read as its visible words, without scripts, styles or comments", () => {
  const p = readPage(`<html><head><title>Brew &amp; Co — Cold brew</title><meta name="description" content="Cold brew, delivered."><meta property="og:site_name" content="Brew &amp; Co">
    <style>.x{color:red}</style><script>var secret = "do not read";</script></head><body>
    <nav><a href="/">Home</a></nav><!-- hidden note -->
    <h1>Cold brew that tastes like coffee</h1><p>Steeped 18 hours.<br>No sugar.</p>
    <a class="btn btn-primary" href="/buy">Start my trial</a><button type="button">Add to cart</button>
    <p>From &#8377;499/month</p></body></html>`);
  assert.equal(p.title, "Brew & Co — Cold brew");
  assert.equal(p.description, "Cold brew, delivered.");
  assert.equal(p.siteName, "Brew & Co");
  assert.deepEqual(p.buttons, ["Start my trial", "Add to cart"]);
  assert.match(p.text, /## Cold brew that tastes like coffee/);
  assert.match(p.text, /From ₹499\/month/);
  assert.doesNotMatch(p.text, /secret|color:red|hidden note/);
  assert.equal(decode("&pound;5 &#x20AC;6 &bogus;"), "£5 €6 &bogus;");
});

test("fields are trimmed to the app's limits and sorted into exact and condensed", () => {
  const page = { title: "Brew", ogTitle: "", description: "", siteName: "", buttons: ["Start my trial"],
    text: "## Cold brew that tastes like coffee\nSteeped 18 hours. No sugar.\nFrom ₹499/month" };
  const { fields, exact, condensed } = checkFields({
    brand: "Brew", headline: "“Cold brew that tastes like coffee”", valueProp: "Cold brew steeped for 18 hours with no sugar.",
    price: "From ₹499/month", cta: "Start my trial", offer: "", proof: "", audience: "", subheadline: "x".repeat(300),
  }, page);
  assert.equal(fields.headline, "Cold brew that tastes like coffee");
  assert.ok(!("offer" in fields));
  assert.ok(fields.subheadline.length <= 120);
  assert.deepEqual(exact.sort(), ["brand", "cta", "headline", "price"]);
  assert.deepEqual(condensed.sort(), ["subheadline", "valueProp"]);
});

test("a headline lifted from the browser title drops the brand on its end", () => {
  const page = { title: "Buy Freshly Roasted Coffee Beans | Blue Tokai", ogTitle: "", description: "", siteName: "", buttons: [], text: "" };
  assert.equal(checkFields({ headline: "Buy Freshly Roasted Coffee Beans | Blue Tokai" }, page).fields.headline, "Buy Freshly Roasted Coffee Beans");
});
