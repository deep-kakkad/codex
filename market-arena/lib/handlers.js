// Shared request handling for the local server and the Netlify functions.
import { runRound, validateTeams, validatePersonas, LIMITS, PERSONA_LIMITS } from "./engine.js";
import { SCENARIO, PERSONAS, DEFAULT_TEAMS } from "./scenario.js";
import { TEMPLATES } from "./templates.js";
import { saveShare, getShareById } from "./store.js";
import { ask as askModel, ASK_COST_CREDITS } from "./ask.js";

const codeOk = (code) => !process.env.ARENA_CODE || (code || "").trim() === process.env.ARENA_CODE;

// Best-effort per-IP throttle for the code-free Practice mode, so a public link can't be
// used to burn the TypeSafe budget. In-memory only: resets on cold start / restart, which
// is an accepted gap for an MVP, not a substitute for real abuse protection at scale.
const PRACTICE_WINDOW_MS = 60 * 60 * 1000;
const PRACTICE_MAX_PER_WINDOW = 20;
const practiceHits = new Map();
function practiceRateLimited(ip) {
  const key = ip || "unknown";
  const now = Date.now();
  const hits = (practiceHits.get(key) || []).filter((t) => now - t < PRACTICE_WINDOW_MS);
  if (hits.length >= PRACTICE_MAX_PER_WINDOW) { practiceHits.set(key, hits); return true; }
  hits.push(now);
  practiceHits.set(key, hits);
  return false;
}

export function scenario() {
  return [200, { scenario: SCENARIO, personas: PERSONAS, defaults: DEFAULT_TEAMS, limits: LIMITS, needsCode: Boolean(process.env.ARENA_CODE) }];
}

export function templates() {
  return [200, { templates: TEMPLATES, limits: LIMITS, personaLimits: PERSONA_LIMITS }];
}

export async function round(rawBody, code, ip) {
  let body;
  try { body = JSON.parse(rawBody || "{}"); } catch { return [400, { error: "The request wasn't valid JSON." }]; }
  const { teams, personas, mode } = body;

  if (mode === "practice") {
    if (!process.env.TYPESAFE_API_KEY) return [500, { error: "The server has no TypeSafe API key. Set TYPESAFE_API_KEY and restart." }];
    if (practiceRateLimited(ip)) return [429, { error: "Too many practice rounds from this connection in the last hour. Try again later." }];
    const teamProblem = validateTeams(teams);
    if (teamProblem) return [400, { error: teamProblem }];
    const personaProblem = validatePersonas(personas);
    if (personaProblem) return [400, { error: personaProblem }];
    try { return [200, await runRound(teams, personas || undefined)]; }
    catch (e) { console.error(e); return [502, { error: "The market simulation couldn't reach TypeSafe. Run the round again in a moment." }]; }
  }

  if (!codeOk(code)) return [401, { error: "That class code isn't right. Ask your facilitator for it." }];
  if (!process.env.TYPESAFE_API_KEY) return [500, { error: "The server has no TypeSafe API key. Set TYPESAFE_API_KEY and restart." }];
  const problem = validateTeams(teams);
  if (problem) return [400, { error: problem }];
  try { return [200, await runRound(teams)]; }
  catch (e) { console.error(e); return [502, { error: "The market simulation couldn't reach TypeSafe. Run the round again in a moment." }]; }
}

// A shared snapshot is exactly one round's result plus a little display context —
// never live state, so a stale link just shows the round as it was when shared.
export async function share(rawBody) {
  let body;
  try { body = JSON.parse(rawBody || "{}"); } catch { return [400, { error: "The request wasn't valid JSON." }]; }
  const { round: r, meta } = body;
  if (!r || !Array.isArray(r.brands) || !r.brands.length || !Array.isArray(r.customers) || !r.customers.length
      || !Array.isArray(r.slots) || r.slots.length !== r.brands.length)
    return [400, { error: "That doesn't look like a round result." }];
  try {
    const roundNo = Number(meta?.round);
    const id = await saveShare({
      round: r,
      meta: { title: String(meta?.title || "").slice(0, 120), brief: String(meta?.brief || "").slice(0, 300), round: Number.isInteger(roundNo) && roundNo > 0 ? roundNo : null },
      sharedAt: Date.now(),
    });
    return [200, { id }];
  } catch (e) { console.error(e); return [502, { error: "Couldn't create a share link. Try again in a moment." }]; }
}

export async function getShare(id) {
  try {
    const data = await getShareById(String(id || ""));
    if (!data) return [404, { error: "This share link doesn't exist, or has expired." }];
    return [200, data];
  } catch (e) { console.error(e); return [502, { error: "Couldn't load that share link. Try again in a moment." }]; }
}

// Ask Market Arena.
//
// This is the only endpoint that spends real money per call, so it stays off until
// it can be metered. An unmetered generative endpoint on a public URL is how people
// wake up to a bill; ASK_ENABLED is the switch, and it should only be turned on once
// credits are deducted against a signed-in account.
export async function askRound(rawBody) {
  if (process.env.ASK_ENABLED !== "1")
    return [503, { error: "Ask isn't switched on yet. It needs an account and a credit balance to charge against." }];
  if (!process.env.OPENAI_API_KEY)
    return [500, { error: "The server has no model key for Ask." }];

  let body;
  try { body = JSON.parse(rawBody || "{}"); } catch { return [400, { error: "The request wasn't valid JSON." }]; }
  const { round, question } = body;
  const q = typeof question === "string" ? question.trim() : "";
  if (!q) return [400, { error: "Ask a question first." }];
  if (q.length > 500) return [400, { error: "That question is too long — keep it under 500 characters." }];
  if (!round?.brands?.length || !round?.customers?.length) return [400, { error: "That doesn't look like a round result." }];

  try {
    const out = await askModel(round, q);
    return [200, { ...out, credits: ASK_COST_CREDITS }];
  } catch (e) {
    console.error(e);
    return [502, { error: "Couldn't reach the model. Try the question again in a moment." }];
  }
}
