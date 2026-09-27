// Roast my ad: one ad, eight simulated buyers, no account.
//
// The free way in. Someone pastes an ad and eight buyers read it on its own and
// decide: buy it, or walk away. It is the same engine a round uses, with one ad
// instead of two to four, so the report can say what worked, what put people off
// and why they passed, in the same terms the full product uses.
//
// Because it needs no account, it is the one model call anyone on the internet can
// trigger. Two limits keep it from becoming a bill: a few roasts a day per
// connection, and a cap on roasts per day for the whole site (ROAST_DAILY_CAP).
// Both are counted in Netlify Blobs so they survive cold starts; locally, in memory.
// The connection is stored only as a salted hash, never as an address.

import { createHash } from "node:crypto";
import { runRound } from "./engine.js";
import { LIMITS } from "../public/validate.js";
import { saveShare } from "./store.js";

export const ROAST_PER_IP = Number(process.env.ROAST_PER_IP || 3);
export const ROAST_DAILY_CAP = Number(process.env.ROAST_DAILY_CAP || 150);

// Two ready panels, eight buyers each in four groups of two. Written to be broad
// rather than tied to one country or category, so any ad gets a fair first read.
export const ROAST_PANELS = {
  people: [
    { id: "r1", name: "Dana", segment: "Careful spenders", profile: "34, runs a household budget to the dollar, compares prices before any purchase, buys only when the value is obvious" },
    { id: "r2", name: "Luis", segment: "Careful spenders", profile: "27, paying off student loans, loves a deal, suspicious of subscriptions he might forget to cancel" },
    { id: "r3", name: "Priya", segment: "Busy professionals", profile: "38, manager with two kids, short on time, pays more for anything that saves her an hour, skims ads fast" },
    { id: "r4", name: "Tom", segment: "Busy professionals", profile: "45, consultant who travels weekly, wants things that just work, low patience for vague claims" },
    { id: "r5", name: "Mei", segment: "Early adopters", profile: "24, tries new apps and products first, follows brands on social media, likes a good story behind a product" },
    { id: "r6", name: "Sam", segment: "Early adopters", profile: "30, tech worker, buys new gadgets and services early, tells friends about good finds" },
    { id: "r7", name: "Grace", segment: "Skeptics", profile: "52, has been burned by products that overpromised, reads reviews before buying anything, distrusts hype" },
    { id: "r8", name: "Omar", segment: "Skeptics", profile: "41, engineer, wants specifics and proof, ignores ads that sound like marketing" },
  ],
  business: [
    { id: "b1", name: "Alex", segment: "Small-company founders", profile: "Founder of a 12-person company, wears every hat, buys tools with a card if they save time this week, hates long setup" },
    { id: "b2", name: "Nadia", segment: "Small-company founders", profile: "Runs a 5-person agency, watches cash closely, will pay for something that wins or keeps clients" },
    { id: "b3", name: "Chris", segment: "Team managers", profile: "Leads a 20-person team at a mid-size firm, needs budget approval above $500, cares about adoption by the team" },
    { id: "b4", name: "Ana", segment: "Team managers", profile: "Operations manager, measured on efficiency, wants clear before-and-after numbers to justify a purchase" },
    { id: "b5", name: "Rahul", segment: "Hands-on specialists", profile: "Senior specialist who would use the product daily, cares about how well it works, dislikes fluffy promises" },
    { id: "b6", name: "Jo", segment: "Hands-on specialists", profile: "Analyst who evaluates tools for the team, compares alternatives, wants specifics and a free trial" },
    { id: "b7", name: "Martin", segment: "Cautious approvers", profile: "Finance lead who signs off purchases, focused on cost, contracts and risk, sceptical of vendor claims" },
    { id: "b8", name: "Keiko", segment: "Cautious approvers", profile: "IT lead, worried about security, data and integration effort, prefers established vendors" },
  ],
};

const txt = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

// The ad as the buyers will read it, or a problem to show on the form. A roast needs
// a headline and some body copy; the name and price are optional, because plenty of
// ads don't state a price, and saying so is better than inventing one.
export function cleanRoast(body) {
  const panel = body?.panel === "business" ? "business" : "people";
  const ad = {
    brand: txt(body?.ad?.brand) || "This brand",
    headline: txt(body?.ad?.headline),
    valueProp: txt(body?.ad?.valueProp),
    price: txt(body?.ad?.price) || "Not stated in the ad",
  };
  if (!ad.headline) return { problem: { field: "headline", message: "Add the headline. It's the first thing a buyer reads." } };
  if (!ad.valueProp) return { problem: { field: "valueProp", message: "Add the body copy: what it is and why it's worth it." } };
  for (const f of ["brand", "headline", "valueProp", "price"]) {
    if (ad[f].length > LIMITS[f]) return { problem: { field: f, message: `That's ${ad[f].length} characters. The limit is ${LIMITS[f]}, so trim ${ad[f].length - LIMITS[f]}.` } };
  }
  return { ad, panel };
}

/* ---- The meter ----------------------------------------------------------------- */
let meter;
async function meterStore() {
  if (meter) return meter;
  try {
    const { getStore } = await import("@netlify/blobs");
    const s = getStore({ name: "roast-meter", consistency: "strong" });
    await s.get("__probe__", { type: "json" });
    meter = { get: async (k) => (await s.get(k, { type: "json" })) || 0, set: (k, v) => s.setJSON(k, v) };
  } catch {
    const m = new Map();
    meter = { get: async (k) => m.get(k) || 0, set: async (k, v) => { m.set(k, v); } };
  }
  return meter;
}
export function resetMeter() { meter = null; }
const today = () => new Date().toISOString().slice(0, 10);
const who = (ip, day) => createHash("sha256").update(`${process.env.ROAST_SALT || "market-arena"}|${day}|${ip || "unknown"}`).digest("hex").slice(0, 24);

// Checks both limits and, if there's room, counts this roast. Counted before the
// run, so a burst of parallel requests can't slip past the cap while they wait.
export async function takeRoast(ip) {
  const s = await meterStore(), day = today();
  const allKey = `all/${day}`, ipKey = `ip/${day}/${who(ip, day)}`;
  const [all, mine] = await Promise.all([s.get(allKey), s.get(ipKey)]);
  if (all >= ROAST_DAILY_CAP) return { ok: false, reason: "cap" };
  if (mine >= ROAST_PER_IP) return { ok: false, reason: "ip" };
  await Promise.all([s.set(allKey, all + 1), s.set(ipKey, mine + 1)]);
  return { ok: true, left: ROAST_PER_IP - mine - 1 };
}

// Checks a roast request and, if it's good and there's room today, returns a
// `run(onBuyer)` that runs it and saves the result for its share link. Saved by the
// server, not sent back by the browser, so a shared verdict is always the real one.
export async function prepareRoast(rawBody, ip) {
  let body;
  try { body = JSON.parse(rawBody || "{}"); } catch { return { error: [400, { error: "The request wasn't valid JSON." }] }; }
  const { ad, panel, problem } = cleanRoast(body);
  if (problem) return { error: [400, { error: problem.message, field: problem.field }] };
  if (!process.env.TYPESAFE_API_KEY) return { error: [500, { error: "The server has no TypeSafe API key." }] };
  const room = await takeRoast(ip);
  if (!room.ok) return { error: [429, room.reason === "cap"
    ? { error: "Today's free roasts are all used up. Come back tomorrow, or start a free project and run full rounds.", signIn: true }
    : { error: `That's ${ROAST_PER_IP} free roasts today from this connection. Start a free project to keep going: rounds are free with an account.`, signIn: true }] };
  const personas = ROAST_PANELS[panel];
  return {
    left: room.left,
    run: async (onBuyer) => {
      const round = await runRound([ad], personas, null, onBuyer);
      let id = null;
      try { id = await saveShare({ kind: "roast", panel, ad, round, sharedAt: Date.now() }); } catch (e) { console.error(e); }
      return { round, panel, ad, id };
    },
  };
}

// Streamed like a round: "start", one "buyer" line per decision, then "result".
export function roastStream(prep) {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(ctrl) {
      const send = (o) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      send({ type: "start", left: prep.left });
      try {
        const data = await prep.run((b) => send({ type: "buyer", ...b }));
        send({ type: "result", data });
      } catch (e) {
        console.error(e);
        send({ type: "error", error: "The buyers couldn't be reached just now. Try again in a moment." });
      }
      ctrl.close();
    },
  });
}
