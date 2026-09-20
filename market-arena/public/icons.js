// Market Arena's small hand-authored icon system: a logo mark, persona archetype
// icons (matched by keyword against a customer's segment/profile text, with a
// deterministic fallback so custom personas always get a consistent icon), plus
// icons for the objection taxonomy and the four funnel stages.

export const LOGO_MARK = (size = 32) => `
<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Market Arena">
  <circle cx="22" cy="24" r="17" stroke="currentColor" stroke-width="4"/>
  <circle cx="38" cy="10" r="6" fill="var(--lime)"/>
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
  { icon: "home", test: /(parent|mother|father|family|homemaker|teacher|kids)/i },
  { icon: "wrench", test: /(engineer|developer|technical|it |cto|security|build)/i },
  { icon: "piggy", test: /(budget|value|frugal|price|saver|debt)/i },
  { icon: "leaf", test: /(eco|sustainab|green|organic|natural)/i },
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
