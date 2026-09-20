// Shared request handling for the local server and the Netlify functions.
import { runRound, validateTeams, LIMITS } from "./engine.js";
import { SCENARIO, PERSONAS, DEFAULT_TEAMS } from "./scenario.js";

const codeOk = (code) => !process.env.ARENA_CODE || (code || "").trim() === process.env.ARENA_CODE;

export function scenario() {
  return [200, { scenario: SCENARIO, personas: PERSONAS, defaults: DEFAULT_TEAMS, limits: LIMITS, needsCode: Boolean(process.env.ARENA_CODE) }];
}

export async function round(rawBody, code) {
  if (!codeOk(code)) return [401, { error: "That class code isn't right. Ask your facilitator for it." }];
  if (!process.env.TYPESAFE_API_KEY) return [500, { error: "The server has no TypeSafe API key. Set TYPESAFE_API_KEY and restart." }];
  let teams;
  try { ({ teams } = JSON.parse(rawBody || "{}")); } catch { return [400, { error: "The request wasn't valid JSON." }]; }
  const problem = validateTeams(teams);
  if (problem) return [400, { error: problem }];
  try { return [200, await runRound(teams)]; }
  catch (e) { console.error(e); return [502, { error: "The market simulation couldn't reach TypeSafe. Run the round again in a moment." }]; }
}
