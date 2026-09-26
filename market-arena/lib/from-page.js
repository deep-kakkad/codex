// Start a version from a web page.
//
// A marketer pastes their own landing page, or a competitor's, and the version's
// headline, value proposition and price fill from what the page actually says, so
// the first round can test the live message rather than a retyping of it.
//
// Three rules keep it honest and safe:
//  - The server fetches only public web addresses. Anything that resolves to a
//    private, loopback or link-local address is refused, and so is every redirect
//    that lands on one, so the function can't be pointed at its own network.
//  - The model is told to copy the page's words. Each field is then checked against
//    the page text on the server, and the response says which fields are the page's
//    exact words and which were condensed, so the review can say so.
//  - The page is read for this one request and not stored anywhere.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { LIMITS, EXTRA_FIELDS } from "../public/validate.js";

const API = "https://api.openai.com/v1/responses";
export const PAGE_MODEL = process.env.PAGE_MODEL || process.env.RESEARCH_MODEL || "gpt-5.4-mini";
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const TEXT_CAP = 14000;       // characters of page text the model sees
export const TEXT_MIN = 120;  // below this there is no message to read

// A message a person can act on, as opposed to an internal failure.
export class PageError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; this.user = true; }
}

/* ---- Which addresses may be fetched ------------------------------------------ */

function ipv4Private(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}
export function isPrivateAddress(ip) {
  const v = isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipv4Private(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8");
  }
  return true;
}

export function checkUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) throw new PageError("Paste the address of the page.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { throw new PageError("That doesn't look like a web address."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new PageError("Only web pages (http or https) can be read.");
  if (u.username || u.password) throw new PageError("Addresses with a login in them can't be read.");
  if (u.port && !["80", "443"].includes(u.port)) throw new PageError("Only pages on the standard web ports can be read.");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new PageError("That address isn't a public web page.");
  }
  if (isIP(host) && isPrivateAddress(host)) throw new PageError("That address isn't a public web page.");
  u.hash = "";
  return u;
}

async function assertPublicHost(u) {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) { if (isPrivateAddress(host)) throw new PageError("That address isn't a public web page."); return; }
  let addrs;
  try { addrs = await lookup(host, { all: true, verbatim: true }); } catch { throw new PageError("Couldn't find that site. Check the address."); }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new PageError("That address isn't a public web page.");
}

/* ---- Fetching ----------------------------------------------------------------- */

export async function fetchPage(raw, { fetchImpl = fetch, resolve = assertPublicHost } = {}) {
  let u = checkUrl(raw);
  const deadline = AbortSignal.timeout(9000);
  for (let hop = 0; ; hop++) {
    await resolve(u);
    let res;
    try {
      res = await fetchImpl(u, {
        redirect: "manual", signal: deadline,
        headers: { "User-Agent": "MarketArenaPageReader/1.0 (+https://market-arena-dk.netlify.app)", Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "Accept-Language": "en;q=0.9,*;q=0.5" },
      });
    } catch (e) {
      throw new PageError(/abort|timeout/i.test(String(e?.name) + String(e?.message)) ? "The page took too long to answer." : "Couldn't reach that page.", 502);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= MAX_REDIRECTS) throw new PageError("That page redirects too many times.", 502);
      u = checkUrl(new URL(res.headers.get("location"), u).href);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new PageError("That page is behind a login or blocks automated readers. Paste its copy instead.", 502);
    if (!res.ok) throw new PageError(`That page answered with an error (${res.status}).`, 502);
    const type = res.headers.get("content-type") || "";
    if (type && !/html|xml|text\/plain/i.test(type)) throw new PageError("That address isn't a web page (it's a file or an image).");
    const html = await readCapped(res);
    return { url: u.href, html };
  }
}

async function readCapped(res) {
  if (!res.body?.getReader) return (await res.text()).slice(0, MAX_BYTES);
  const reader = res.body.getReader();
  const chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); n += value.length;
    if (n >= MAX_BYTES) { reader.cancel().catch(() => {}); break; }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

/* ---- Reading the page --------------------------------------------------------- */

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", pound: "£", euro: "€", yen: "¥", copy: "©", reg: "®", trade: "™", middot: "·", bull: "•", times: "×", rupee: "₹" };
export const decode = (s) => String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const c = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(c) && c > 0 && c < 0x110000 ? String.fromCodePoint(c) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const clean = (s) => decode(String(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")) || []).slice(2).find((x) => x != null) || "";

function meta(html, key) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const t = m[0];
    if ([attr(t, "name"), attr(t, "property")].some((v) => v.toLowerCase() === key)) return clean(attr(t, "content"));
  }
  return "";
}

// Buttons that work the page rather than sell anything.
const UI_WORDS = /^(close|open|menu|search|cancel|submit|next|previous|prev|back|play|pause|skip|toggle|more|less|show|hide|dismiss|accept|reject|ok|got it|x|site navigation|close menu|close cart|cart|account|log ?in|sign ?in|language|country|en|pause slideshow play slideshow|play slideshow|pause slideshow)$/i;

// The page as text a model can read: its title and description, its buttons, and
// its visible words in reading order, one block per line.
export function readPage(html) {
  const body = String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|canvas|select)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const title = clean((body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const headings = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].map((m) => clean(m[1])).filter(Boolean).slice(0, 3);
  const buttons = [...new Set([...body.matchAll(/<(button)\b[^>]*>([\s\S]*?)<\/button>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .filter((m) => m[1] || /\b(btn|button|cta)\b/i.test(attr(`<a ${m[3]}>`, "class")) || /\brole\s*=\s*["']?button/i.test(m[3] || ""))
    .map((m) => clean(m[2] ?? m[4]))
    .filter((t) => t.length >= 2 && t.length <= 40 && /\p{L}{2}/u.test(t) && !UI_WORDS.test(t)))].slice(0, 16);
  const text = decode(body
    .replace(/<(h[1-6])\b[^>]*>/gi, "\n## ")
    .replace(/<\/(p|div|section|article|header|footer|li|h[1-6]|tr|blockquote|figcaption|main|nav|aside|form|label|dd|dt)\s*>/gi, "\n")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " "))
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && l !== "##")
    .filter((l, i, a) => a.indexOf(l) === i)
    .join("\n");
  return {
    title,
    description: meta(body, "description") || meta(body, "og:description"),
    siteName: meta(body, "og:site_name") || meta(body, "application-name"),
    ogTitle: meta(body, "og:title"),
    headings,
    buttons,
    text: text.slice(0, TEXT_CAP),
  };
}

/* ---- Extracting a version ----------------------------------------------------- */

const X = Object.fromEntries(EXTRA_FIELDS.map((f) => [f.key, f.max]));
const FIELD_MAX = { brand: LIMITS.brand, headline: LIMITS.headline, valueProp: LIMITS.valueProp, price: LIMITS.price,
  subheadline: X.subheadline, cta: X.cta, offer: X.offer, proof: X.proof, audience: X.audience };
export const PAGE_FIELDS = Object.keys(FIELD_MAX);

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: [...PAGE_FIELDS, "missing"],
  properties: { ...Object.fromEntries(PAGE_FIELDS.map((k) => [k, { type: "string" }])), missing: { type: "string" } },
};

const INSTRUCTIONS = `You read a product's web page and pull out the marketing message it leads with,
so it can be tested against other versions. Use the page's own words. Never write
new copy, never improve it, never invent a price, offer or claim the page doesn't make.

FIELDS (empty string when the page doesn't have it)
- brand: the product or company name, at most ${FIELD_MAX.brand} characters.
- headline: the main visible headline at the top of the page (usually its first main
  heading), copied exactly. Not the browser title, and never with "| Brand" or "– Brand"
  on the end. Use the title only if the page has no visible headline. At most ${FIELD_MAX.headline} characters.
- subheadline: the visible line directly under the headline, copied exactly. Never a
  brand name or a fragment of the title. At most ${FIELD_MAX.subheadline}.
- valueProp: what the product is and why someone would want it, in the page's words.
  Copy one or two sentences exactly if the page has them; otherwise join the page's own
  phrases with as few added words as possible. At most ${FIELD_MAX.valueProp} characters.
- price: the price as the page states it (for example "$12/month", "From ₹499"), copied
  exactly. If several plans, the entry or most prominent one. At most ${FIELD_MAX.price}.
- cta: the main button's words, copied exactly. At most ${FIELD_MAX.cta}.
- offer: a trial, discount, guarantee period or bundle the page promotes, copied exactly. At most ${FIELD_MAX.offer}.
- proof: one statistic, award, or a customer's review sentence that backs the message,
  copied exactly. Never a person's name, and never stars or a rating on their own. At most ${FIELD_MAX.proof}.
- audience: the specific kind of buyer the page says it is for (for example "for busy
  parents", "for small agencies"), in its words. Empty when it only says something
  general like "for your team". At most ${FIELD_MAX.audience}.
- missing: one short sentence naming what a buyer would want that the page doesn't say
  (for example the price), or an empty string.
Ignore cookie banners, navigation, footers, legal text, and interface words stuck to
the copy (such as "copied", "Sold out", "Add to cart" inside an offer).`;

// Loose on spacing, case and quote marks; strict on words.
const norm = (s) => String(s || "").toLowerCase()
  .replace(/[‘’‛′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—]/g, "-")
  .replace(/\s+/g, " ").trim();

// Trims every field to the app's limits and sorts them into the page's exact words
// and words that were condensed from it.
export function checkFields(raw, page) {
  const hay = norm([page.title, page.ogTitle, page.description, page.siteName, ...(page.headings || []), ...page.buttons, page.text].join("\n"));
  const fields = {}, exact = [], condensed = [];
  for (const k of PAGE_FIELDS) {
    let v = String(raw?.[k] || "").replace(/\s+/g, " ").trim().replace(/^["“]|["”]$/g, "").trim();
    // A headline taken from the browser title loses the "| Brand" on its end.
    if (k === "headline" && page.title && norm(v) === norm(page.title)) v = v.split(/\s+[|–—]\s+|\s+-\s+/)[0].trim();
    if (!v) continue;
    const cut = v.length > FIELD_MAX[k] ? v.slice(0, FIELD_MAX[k]).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") : v;
    if (!cut) continue;
    fields[k] = cut;
    (hay.includes(norm(cut)) ? exact : condensed).push(k);
  }
  return { fields, exact, condensed };
}

export async function extractVersion({ url, page }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("no-key");
  const input = [
    `Address: ${url}`,
    page.siteName ? `Site name: ${page.siteName}` : "",
    page.title ? `Title: ${page.title}` : "",
    page.ogTitle && page.ogTitle !== page.title ? `Share title: ${page.ogTitle}` : "",
    page.description ? `Description: ${page.description}` : "",
    page.headings?.length ? `Main heading${page.headings.length > 1 ? "s" : ""} on the page: ${page.headings.join(" | ")}` : "",
    page.buttons.length ? `Buttons: ${page.buttons.join(" | ")}` : "",
    "", "PAGE TEXT (## marks a heading)", page.text,
  ].filter((x) => x !== "").join("\n");
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: PAGE_MODEL, instructions: INSTRUCTIONS, input,
      text: { format: { type: "json_schema", name: "page_version", strict: true, schema: SCHEMA } },
      max_output_tokens: 1500,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `OpenAI returned ${res.status}`);
  const out = (body.output || []).filter((o) => o.type === "message").flatMap((o) => o.content || [])
    .filter((c) => c.type === "output_text").map((c) => c.text).join("");
  let raw;
  try { raw = JSON.parse(out); } catch { throw new Error("unreadable"); }
  return { ...checkFields(raw, page), missing: String(raw.missing || "").trim().slice(0, 200), model: body.model || PAGE_MODEL };
}
