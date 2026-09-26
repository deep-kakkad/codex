// Market Arena's small hand-authored icon system: a logo mark, persona archetype
// icons (matched by keyword against a customer's segment/profile text, with a
// deterministic fallback so custom personas always get a consistent icon), plus
// icons for the objection taxonomy and the four funnel stages.

// The logo is the arena in miniature: a half-circle of seats, one of them taken
// by the brand colour. It is the same shape the product draws every round.
export const LOGO_MARK = (size = 32) => `
<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Market Arena">
  <circle cx="7.0" cy="33.0" r="5.2" fill="currentColor"/><circle cx="12.0" cy="21.0" r="5.2" fill="currentColor"/><circle cx="24.0" cy="16.0" r="5.2" fill="currentColor"/><circle cx="36.0" cy="21.0" r="5.2" fill="var(--brand-dot, #FF5A36)"/><circle cx="41.0" cy="33.0" r="5.2" fill="currentColor"/><rect x="4" y="41.5" width="40" height="3" rx="1.5" fill="currentColor" opacity=".35"/>
</svg>`;

// The arena mark: four corner brackets around a decision point — a bounded
// space where something gets chosen. No shields, no colosseum, no flames.
export const ARENA_MARK = (size = 26) => `
<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Market Arena">
  <path d="M3 10V5a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M29 10V5a2 2 0 0 0-2-2h-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M3 22v5a2 2 0 0 0 2 2h5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M29 22v5a2 2 0 0 1-2 2h-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="16" cy="16" r="3.4" fill="var(--accent)"/>
</svg>`;

const PATHS = {
  briefcase: 'M4 8h16v11H4z M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M4 12h16',
  backpack: 'M7 8V6a5 5 0 0 1 10 0v2 M6 8h12v13H6z M9 12h6 M9 8v2 M15 8v2',
  heart: 'M12 20s-7-4.5-9-9c-1.4-3 .8-6.5 4-6.5 2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.2 0 5.4 3.5 4 6.5-2 4.5-9 9-9 9z',
  home: 'M4 11 12 4l8 7 M6 10v9h12v-9 M10 19v-5h4v5',
  wrench: 'M15 6a4 4 0 0 0-5.3 4.3L4 16l3 3 5.7-5.7A4 4 0 0 0 17 8l-2.5 2.5-2-2z',
  piggy: 'M5 12a6 6 0 0 1 11-3.4l2-.6-.4 2.3A6 6 0 0 1 18 13v3l2 1-1 2-2-1-1 1H8l-1 2H4l1.5-3A6 6 0 0 1 5 13z M9 11h.01',
  leaf: 'M5 19c8 1 13-4 13-13-9 0-13 5-13 13z M5 19c1-4 3-7 8-9',
  star: 'm12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z',
  graduate: 'M12 5 2 9l10 4 10-4z M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5 M22 9v6',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M5 20c1.5-4 4-6 7-6s5.5 2 7 6',
};

const ARCHETYPES = [
  { icon: "briefcase", test: /(professional|manager|executive|analyst|director|founder|operator|lead|officer|banker|consult)/i },
  { icon: "graduate", test: /(student|school|college|university|campus|freelanc|solo)/i },
  { icon: "heart", test: /(health|wellness|yoga|doctor|nurse|fitness|runner|medical)/i },
  { icon: "home", test: /(parent|mother|father|family|homemaker|teacher|kids|convenience)/i },
  { icon: "wrench", test: /(engineer|developer|technical|it |cto|security|build)/i },
  { icon: "piggy", test: /(budget|value|frugal|price|saver|debt)/i },
  { icon: "leaf", test: /(eco|sustainab|green|organic|natural|enthusiast)/i },
  { icon: "star", test: /(premium|luxury|early adopter|collector|trend)/i },
  { icon: "shield", test: /(skeptic|traditional|risk-averse|distrust|wary|cautious)/i },
];

export function personaIconId(persona) {
  const text = `${persona.segment || ""} ${persona.profile || ""}`;
  const hit = ARCHETYPES.find((a) => a.test.test(text));
  if (hit) return hit.icon;
  const keys = Object.keys(PATHS);
  let h = 0;
  for (const ch of String(persona.id || persona.name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return keys[h % keys.length];
}

export function iconSvg(id, size = 20) {
  const d = PATHS[id] || PATHS.person;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export function personaIcon(persona, size = 20) {
  return iconSvg(personaIconId(persona), size);
}

const OBJ_ICON = {
  price: 'M5 4h8l6 6-9 9-6-6z M9 8h.01',
  trust: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M12 8v5 M12 15.5h.01',
  relevance: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M20 4l-4.5 4.5',
  unclear: 'M9 9c0-2 1.5-3.5 3.5-3.5S16 7 16 9c0 2-2 2.5-3 3.5-.6.6-.5 1.5-.5 2 M12.5 18h.01',
  none: 'M20 6 9 17l-5-5',
};
export function objectionIcon(key, size = 16) {
  const d = OBJ_ICON[key] || OBJ_ICON.unclear;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

const STAGE_ICON = {
  attention: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  interest: 'M12 2c1 4-4 5-4 9a4 4 0 0 0 8 0c0-1.5-1-2-1-3.5 1.5 1 2.5 3 2.5 5A5.5 5.5 0 0 1 12 18a5.5 5.5 0 0 1-5.5-5.5C6.5 8 9 6 12 2z',
  belief: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4',
  purchase: 'M4 5h2l2 11h10l2-8H7 M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M16 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
};
export function stageIcon(key, size = 16) {
  const d = STAGE_ICON[key] || STAGE_ICON.attention;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export function checkIcon(size = 14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
}
export function crossIcon(size = 14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
}

// A mark per starting case, so the picker reads as four distinct places to begin
// rather than four paragraphs. Hand-drawn in the same 24-unit grid as the archetype
// icons above; the tint is the case's own, and it is the only colour on the card.
const CASE_MARKS = {
  "cpg-coffee": { tint: "#7A4A21", d: "M4 8h11v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M15 10h3a2.5 2.5 0 0 1 0 5h-3 M7 2v3 M11 2v3" },
  "saas-projectflow": { tint: "#2D5B8E", d: "M4 5h7v6H4z M13 5h7v3h-7z M13 13h7v6h-7z M4 13h7v6H4z" },
  "retail-dtc": { tint: "#6E3F73", d: "M6 7h12l1 13H5z M9 7V5a3 3 0 0 1 6 0v2 M9 11v1 M15 11v1" },
  "fintech-app": { tint: "#1F6B63", d: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M10 17h4 M9 7h6 M9 10h6" },
  blank: { tint: "#6B6B66", d: "M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h4" },
};

export const caseMark = (id, size = 30) => {
  const m = CASE_MARKS[id] || CASE_MARKS.blank;
  return `<svg class="casemark" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="--tint:${m.tint}">
    ${m.d.split(" M").map((seg, i) => `<path d="${i ? "M" + seg : seg}" stroke="var(--tint)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}
  </svg>`;
};
export const caseTint = (id) => (CASE_MARKS[id] || CASE_MARKS.blank).tint;

/* ---------------------------------------------------------------------------
   Buyer faces.

   Drawn here rather than fetched, for three reasons: a buyer profile can describe
   a real customer segment, and sending that to a third-party avatar service would
   leak it; an external request per buyer is 16 requests that can fail; and the app
   has no build step to bundle an avatar package into.

   DiceBear's CC0 styles (Lorelei, Notionists, Open Peeps) would be the off-the-shelf
   answer if those constraints ever change — public domain, no attribution owed.

   Everything is deterministic from the buyer's id, so a face never changes under
   the user, and the ring colour is the segment's, so buyers in the same segment
   read as a group at a glance. --------------------------------------------------- */

// Segment tints, assigned by the segment's position in the panel. Distinct in hue
// and roughly matched in lightness so no segment looks more important than another.
export const SEGMENT_TINTS = ["#2D5B8E", "#6E3F73", "#1F6B63", "#8A5A1F", "#7A3B4E", "#3F5B2C"];
export const segmentTint = (i) => SEGMENT_TINTS[i % SEGMENT_TINTS.length];

const SKIN = ["#F2C9A0", "#D9A273", "#B07A4E", "#8A5A36", "#6B4226", "#F7DCC0"];
const HAIR_COLOR = ["#2B211A", "#4A3526", "#6E4B2A", "#1C1C1C", "#8A6A45", "#3A2F2A"];
// Each entry is drawn over the head, in the 0-48 box the head occupies.
const HAIR = [
  'M10 22a14 14 0 0 1 28 0v-3a14 14 0 0 0-28 0z',                      // short crop
  'M10 24a14 14 0 0 1 28 0v-2c0-9-6-13-14-13S10 13 10 22z M9 24c0 8 1 12 2 14l2-10z M39 24c0 8-1 12-2 14l-2-10z', // long
  'M11 20a13 13 0 0 1 26 0c0 2-2-4-13-4S11 22 11 20z',                  // wave
  'M12 21c2-8 8-11 12-11s10 3 12 11c0 0-3-5-12-5s-12 5-12 5z M17 9c2-3 12-3 14 0', // bun-ish
  'M10 23a14 14 0 0 1 28 0c0-10-5-14-14-14S10 13 10 23z M14 12c4 4 16 4 20 0', // side part
  'M12 22a12 12 0 0 1 24 0c0-1-1-7-12-7s-12 6-12 7z M36 22c3 1 4 4 3 7',  // tight curls
];
const EYES = [
  'M18 26h3 M27 26h3',                                                  // calm line
  'M19.5 26a1.6 1.6 0 1 0 0-.1z M28.5 26a1.6 1.6 0 1 0 0-.1z',          // round
  'M17.5 27c1-1.6 3-1.6 4 0 M26.5 27c1-1.6 3-1.6 4 0',                  // upturned
];
const MOUTH = ['M20 34c2 2 6 2 8 0', 'M21 34h6', 'M20 33c2 3 6 3 8 0 M20 33h8'];
const BROW = ['M17 22c2-1 4-1 5 0 M26 22c1-1 3-1 5 0', 'M17 22h5 M26 22h5'];

// One detail per face, chosen from what the buyer's segment and profile suggest (a
// student gets headphones or a beanie, a professional glasses or a coffee), so a
// panel reads as particular people rather than one face in different colours. Each
// is drawn in the same 48-unit box, after the face, and none of it is a circle
// sitting directly in the svg, which the live arena relies on to find the ring.
const INK = "#2B211A";
const HAT = ["#3A4A5C", "#7A3B2E", "#2F4F3A", "#5A4A6E", "#8A6A2A"];
const ACCESSORY = {
  glasses: () => `<g fill="none" stroke="${INK}" stroke-width="1.3"><rect x="15.3" y="22.8" width="7.4" height="5.8" rx="2.4"/><rect x="25.3" y="22.8" width="7.4" height="5.8" rx="2.4"/><path d="M22.7 25.2c.8-.7 1.8-.7 2.6 0M15.3 24.8l-2.2-.9M32.7 24.8l2.2-.9"/></g>`,
  shades: () => `<g stroke="${INK}" stroke-width="1.2"><path d="M14.8 23.2h8.2v2.4a3.2 3.2 0 0 1-3.2 3.2h-1.8a3.2 3.2 0 0 1-3.2-3.2zM25 23.2h8.2v2.4a3.2 3.2 0 0 1-3.2 3.2h-1.8a3.2 3.2 0 0 1-3.2-3.2z" fill="${INK}" fill-opacity=".82"/><path d="M23 24.2h2M14.8 23.6l-1.8-.7M33.2 23.6l1.8-.7" fill="none"/></g>`,
  headphones: () => `<g><path d="M11.8 28C11 6.5 37 6.5 36.2 28" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><rect x="9.2" y="23.5" width="5" height="9" rx="2.3" fill="${INK}"/><rect x="33.8" y="23.5" width="5" height="9" rx="2.3" fill="${INK}"/></g>`,
  cap: (c) => `<g fill="${c}"><path d="M11.6 21.5a12.4 11.5 0 0 1 24.8 0z"/><path d="M23 20.3h15.2a1.6 1.6 0 0 1 0 3.2H23z"/><path d="M24 10.4v2.2" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/></g>`,
  beanie: (c) => `<g fill="${c}"><path d="M11.8 21.4a12.2 12.8 0 0 1 24.4 0z"/><rect x="11" y="18.6" width="26" height="4.4" rx="2.2" style="filter:brightness(.8)"/><path d="M24 6.4a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z"/></g>`,
  headband: (c) => `<path d="M13.2 21c6.2-3.6 15.4-3.6 21.6 0" fill="none" stroke="${c}" stroke-width="2.8" stroke-linecap="round"/>`,
  earrings: () => `<g fill="#D9A441"><path d="M13.4 30a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zM34.6 30a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z"/></g>`,
  coffee: () => `<g stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"><path d="M30.5 34h8l-.9 7.2h-6.2z" fill="#fff"/><path d="M30.2 34h8.6" stroke-width="1.6" stroke-linecap="round"/><path d="M33 31.6c-.6-.9.6-1.4 0-2.3M36 31.6c-.6-.9.6-1.4 0-2.3" fill="none" stroke="#8E8E95" stroke-linecap="round"/></g>`,
  leaf: () => `<path d="M16.2 41.5c-.2-3.4 2.2-5.4 5.6-5.2.2 3.4-2.2 5.4-5.6 5.2zM16.2 41.5l3-3" fill="#5E8C4A" stroke="#3F6B30" stroke-width=".8" stroke-linecap="round"/>`,
};
// Which details fit which kind of buyer; one is picked by the buyer's id, and some
// lists include nothing so not every face wears something.
const WEARS = {
  briefcase: ["glasses", "coffee", "glasses"], graduate: ["headphones", "beanie", "cap"], heart: ["headband", "none"],
  home: ["coffee", "earrings", "none"], wrench: ["glasses", "headphones"], piggy: ["cap", "none", "glasses"],
  leaf: ["beanie", "leaf", "coffee"], star: ["earrings", "shades", "none"], shield: ["glasses", "cap", "none"],
};

// Small stable string hash. Same buyer, same face, every render and every device.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

// The same traits the face draws, for anything else that shows this buyer (the 3D
// room on the homepage), so a buyer looks like one person everywhere.
export function faceTraits(persona) {
  const h = hash(persona?.id || persona?.name || "buyer");
  return { skin: SKIN[h % SKIN.length], hairColor: HAIR_COLOR[(h >> 6) % HAIR_COLOR.length], hairStyle: (h >> 3) % HAIR.length };
}

// `opts.tint` replaces the segment colour. The report passes "currentColor", so the
// face takes whatever colour its container sets, which is how a buyer's pick colours
// their face and how that colour can be animated in. `opts.dashed` marks a buyer whose
// top two choices were too close to call.
export function buyerFace(persona, segmentIndex = 0, size = 48, opts = {}) {
  const h = hash(persona?.id || persona?.name || "buyer");
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >> 3) % HAIR.length];
  const hairC = HAIR_COLOR[(h >> 6) % HAIR_COLOR.length];
  const eyes = EYES[(h >> 9) % EYES.length];
  const mouth = MOUTH[(h >> 12) % MOUTH.length];
  const brow = BROW[(h >> 15) % BROW.length];
  const tint = opts.tint || segmentTint(segmentIndex);
  const wears = WEARS[personaIconId(persona || {})] || ["none"];
  // A separate hash, so the detail doesn't move in step with the features above
  // when ids differ only in their last character.
  const hw = hash(`${persona?.id || persona?.name || "buyer"}|wears`);
  const acc = ACCESSORY[wears[hw % wears.length]];
  const extra = acc ? acc(HAT[(hw >> 4) % HAT.length]) : "";
  const label = persona?.name ? `${persona.name}${persona.segment ? `, ${persona.segment}` : ""}` : "Buyer";
  return `
<svg class="buyerface" width="${size}" height="${size}" viewBox="0 0 48 48" role="img" aria-label="${String(label).replace(/"/g, "&quot;")}">
  <circle cx="24" cy="24" r="23" fill="${tint}" opacity="0.14"/>
  <circle cx="24" cy="24" r="23" fill="none" stroke="${tint}" stroke-width="${opts.dashed ? 2.4 : 2}"${opts.dashed ? ' stroke-dasharray="5 4"' : ""}/>
  <path d="M13 44c1.5-7 5.5-10 11-10s9.5 3 11 10z" fill="${tint}" opacity="0.55"/>
  <ellipse cx="24" cy="26" rx="11" ry="12.5" fill="${skin}"/>
  <path d="${hair}" fill="${hairC}"/>
  <g stroke="#2B211A" stroke-width="1.6" stroke-linecap="round" fill="none">
    <path d="${brow}" opacity="0.75"/>
    <path d="${eyes}"/>
    <path d="${mouth}"/>
  </g>${extra}
</svg>`;
}
