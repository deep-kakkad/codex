// The one definition of a valid round, shared by the browser and the server.
// It lives under public/ because that is the only directory the browser can fetch
// from; lib/engine.js imports it from here so the two can never disagree.
//
// Every check returns a structured problem — { index, field, message } — rather than
// just a sentence, so the client can put the message on the offending field instead
// of dropping it in a global status line the user then has to map back to a card.

export const LIMITS = { brand: 30, headline: 90, valueProp: 280, price: 50, minTeams: 2, maxTeams: 4 };
export const PERSONA_LIMITS = { minPersonas: 4, maxPersonas: 16, name: 30, segment: 40, profile: 260 };

// Optional fields a project can switch on, turning a copy test into a positioning
// test. `ad` is the key the model actually sees, so each one reads as its own
// attribute rather than as text bolted onto the value proposition.
//
// They can only be switched on before the first round. Once a round exists the set
// is locked, so every round in a project describes its ads the same way and any
// comparison between rounds is like for like by construction.
export const EXTRA_FIELDS = [
  { key: "subheadline", label: "Subheadline",           ad: "subheadline",        max: 120, tag: "input",    hint: "The supporting line under the headline." },
  { key: "cta",         label: "Call to action",        ad: "call_to_action",     max: 40,  tag: "input",    hint: "What the button or link says." },
  { key: "offer",       label: "Offer or promotion",    ad: "offer",              max: 120, tag: "input",    hint: "A trial, discount or bundle attached to the deal." },
  { key: "proof",       label: "Proof point",           ad: "proof_point",        max: 160, tag: "input",    hint: "A statistic, guarantee or review that backs the claim." },
  { key: "audience",    label: "Who it is for",         ad: "audience",           max: 100, tag: "input",    hint: "The buyer the ad names out loud." },
  { key: "visual",      label: "What the visual shows", ad: "visual_description", max: 200, tag: "textarea", hint: "Describe the image in words. The model reads text and cannot see pictures, so this tests your description, not your artwork." },
];
export const EXTRA_BY_KEY = Object.fromEntries(EXTRA_FIELDS.map((f) => [f.key, f]));
export const extraKeysOf = (teams) =>
  EXTRA_FIELDS.map((f) => f.key).filter((k) => teams.some((t) => t?.extras && t.extras[k] != null));

const TEAM_FIELD = { brand: "name", headline: "headline", valueProp: "value proposition", price: "price" };
const PERSONA_FIELD = { name: "name", segment: "segment", profile: "profile" };

const txt = (v) => (typeof v === "string" ? v.trim() : "");
// Name the thing the way the user named it. "BrewRush is missing its headline" beats
// "Version 2 is missing its headline", which makes them count cards to find it.
const who = (obj, i, fallback) => txt(obj?.brand) || txt(obj?.name) || `${fallback} ${i + 1}`;

export function findTeamProblem(teams) {
  if (!Array.isArray(teams) || teams.length < LIMITS.minTeams || teams.length > LIMITS.maxTeams)
    return { index: null, field: null, message: `Enter between ${LIMITS.minTeams} and ${LIMITS.maxTeams} versions.` };

  const seen = new Map();
  for (const [i, t] of teams.entries()) {
    for (const f of Object.keys(TEAM_FIELD)) {
      const v = txt(t?.[f]);
      if (!v) return { index: i, field: f, message: `${who(t, i, "Version")} is missing its ${TEAM_FIELD[f]}.` };
      if (v.length > LIMITS[f])
        return { index: i, field: f, message: `${who(t, i, "Version")}'s ${TEAM_FIELD[f]} is ${v.length} characters — the limit is ${LIMITS[f]}.` };
    }
    const key = txt(t.brand).toLowerCase();
    if (seen.has(key))
      return { index: i, field: "brand", message: `Two versions are called "${txt(t.brand)}". Give each one its own name so the report can tell them apart.` };
    seen.set(key, i);
  }

  // Every version has to carry the same fields, or the round is comparing ads with
  // different shapes and the winner could just be the one with more to read.
  for (const key of extraKeysOf(teams)) {
    const f = EXTRA_BY_KEY[key];
    for (const [i, t] of teams.entries()) {
      const v = txt(t?.extras?.[key]);
      if (!v) return { index: i, field: `extra:${key}`, message: `${who(t, i, "Version")} is missing its ${f.label.toLowerCase()}. Every version needs it, or the comparison is not like for like.` };
      if (v.length > f.max)
        return { index: i, field: `extra:${key}`, message: `${who(t, i, "Version")}'s ${f.label.toLowerCase()} is ${v.length} characters — the limit is ${f.max}.` };
    }
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
