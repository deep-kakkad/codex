// The one definition of a valid round, shared by the browser and the server.
// It lives under public/ because that is the only directory the browser can fetch
// from; lib/engine.js imports it from here so the two can never disagree.
//
// Every check returns a structured problem — { index, field, message } — rather than
// just a sentence, so the client can put the message on the offending field instead
// of dropping it in a global status line the user then has to map back to a card.

export const LIMITS = { brand: 30, headline: 90, valueProp: 280, price: 50, minTeams: 2, maxTeams: 4 };
export const PERSONA_LIMITS = { minPersonas: 4, maxPersonas: 16, name: 30, segment: 40, profile: 260 };

const TEAM_FIELD = { brand: "name", headline: "headline", valueProp: "value proposition", price: "price" };
const PERSONA_FIELD = { name: "name", segment: "segment", profile: "profile" };

const txt = (v) => (typeof v === "string" ? v.trim() : "");
// Name the thing the way the user named it. "BrewRush is missing its headline" beats
// "Contender 2 is missing its headline", which makes them count cards to find it.
const who = (obj, i, fallback) => txt(obj?.brand) || txt(obj?.name) || `${fallback} ${i + 1}`;

export function findTeamProblem(teams) {
  if (!Array.isArray(teams) || teams.length < LIMITS.minTeams || teams.length > LIMITS.maxTeams)
    return { index: null, field: null, message: `Enter between ${LIMITS.minTeams} and ${LIMITS.maxTeams} contenders.` };

  const seen = new Map();
  for (const [i, t] of teams.entries()) {
    for (const f of Object.keys(TEAM_FIELD)) {
      const v = txt(t?.[f]);
      if (!v) return { index: i, field: f, message: `${who(t, i, "Contender")} is missing its ${TEAM_FIELD[f]}.` };
      if (v.length > LIMITS[f])
        return { index: i, field: f, message: `${who(t, i, "Contender")}'s ${TEAM_FIELD[f]} is ${v.length} characters — the limit is ${LIMITS[f]}.` };
    }
    const key = txt(t.brand).toLowerCase();
    if (seen.has(key))
      return { index: i, field: "brand", message: `Two contenders are called "${txt(t.brand)}". Give each one its own name so the report can tell them apart.` };
    seen.set(key, i);
  }
  return null;
}

export function findPersonaProblem(personas) {
  if (personas == null) return null;
  const L = PERSONA_LIMITS;
  if (!Array.isArray(personas) || personas.length < L.minPersonas || personas.length > L.maxPersonas)
    return { index: null, field: null, message: `Enter between ${L.minPersonas} and ${L.maxPersonas} buyers.` };

  const seen = new Set();
  for (const [i, p] of personas.entries()) {
    for (const f of Object.keys(PERSONA_FIELD)) {
      const v = txt(p?.[f]);
      if (!v) return { index: i, field: f, message: `${who(p, i, "Buyer")} is missing a ${PERSONA_FIELD[f]}.` };
      if (v.length > L[f])
        return { index: i, field: f, message: `${who(p, i, "Buyer")}'s ${PERSONA_FIELD[f]} is ${v.length} characters — the limit is ${L[f]}.` };
    }
    const key = String(p.id ?? i);
    if (seen.has(key)) return { index: i, field: "name", message: `Two buyers share the same id.` };
    seen.add(key);
  }
  return null;
}
