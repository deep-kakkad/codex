// A small line drawing for each of the six questions a round can answer, so the first
// choice in the builder can be scanned at a glance. Ink strokes in currentColor, one
// accent in the action colour, all on a 64 × 40 grid so they sit on a common baseline.

const svg = (body) => `<svg class="gart" viewBox="0 0 64 40" width="64" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ACC = "var(--signal)";

export const GOAL_ART = {
  // Two framings of the same product; one lands.
  positioning: svg(`
    <rect x="6" y="9" width="24" height="22" rx="3"/><path d="M11 16h14M11 21h10"/>
    <rect x="34" y="6" width="24" height="26" rx="3" stroke="${ACC}"/><path d="M39 13h14M39 18h10" stroke="${ACC}"/>
    <path d="m40 25 3 3 7-7" stroke="${ACC}" stroke-width="1.8"/>`),
  // A price tag with a question on it.
  price: svg(`
    <path d="M6 11h30l12 9-12 9H6a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2z"/>
    <circle cx="11" cy="20" r="1.8"/>
    <path d="M20 17a3.6 3.6 0 1 1 4.8 3.4c-.9.3-1.2 1-1.2 1.9v.6" stroke="${ACC}" stroke-width="1.8"/>
    <circle cx="23.6" cy="26.3" r="1" fill="${ACC}" stroke="none"/>
    <path d="M52 13v14M56 16.5v7M60 19v2" opacity=".45"/>`),
  // An alarm clock: does it feel like a problem worth solving now?
  urgency: svg(`
    <circle cx="32" cy="22" r="12"/><path d="M32 15v7l5 3" stroke="${ACC}" stroke-width="1.8"/>
    <path d="M21 9.5 17 13M43 9.5l4 3.5M24 34l-3 3M40 34l3 3"/>
    <path d="M9 18h5M8 24h6M50 18h5M50 24h6" opacity=".45"/>`),
  // A feed of posts; the eye stops on one.
  attention: svg(`
    <rect x="18" y="3" width="28" height="34" rx="4"/>
    <path d="M23 10h18M23 31h18" opacity=".45"/>
    <rect x="22" y="15" width="20" height="11" rx="2" stroke="${ACC}"/>
    <path d="M50 20.5c2.2-2.8 4.4-4 6.5-4s4.3 1.2 6.5 4c-2.2 2.8-4.4 4-6.5 4s-4.3-1.2-6.5-4z" transform="translate(-2 0)"/>
    <circle cx="54.5" cy="20.5" r="1.6" fill="currentColor" stroke="none"/>`),
  // Three buyers; one is the audience.
  audience: svg(`
    <circle cx="14" cy="15" r="4.5"/><path d="M6 32c0-5 3.6-8.5 8-8.5s8 3.5 8 8.5"/>
    <circle cx="50" cy="15" r="4.5"/><path d="M42 32c0-5 3.6-8.5 8-8.5s8 3.5 8 8.5"/>
    <circle cx="32" cy="13" r="5" stroke="${ACC}"/><path d="M23 32c0-5.6 4-9.5 9-9.5s9 3.9 9 9.5" stroke="${ACC}"/>
    <circle cx="32" cy="20" r="15.5" stroke="${ACC}" stroke-dasharray="2 3.5" opacity=".7"/>`),
  // A seedling out of a box: is there demand at all?
  demand: svg(`
    <path d="M18 24h28l-3 13H21z"/><path d="M16 24h32"/>
    <path d="M32 24V12" stroke="${ACC}" stroke-width="1.8"/>
    <path d="M32 16c-1-5-5-7-9-6.5.5 4.5 4 7 9 6.5zM32 13c1-4.5 4.5-6.5 8.5-6 0 4-3.5 6.5-8.5 6z" stroke="${ACC}"/>`),
};
