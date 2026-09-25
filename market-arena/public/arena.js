// The arena: every buyer as a seat in a half-circle chamber, the way a parliament
// shows a vote. Seats are grouped into blocs (by the version each buyer chose, or by
// segment), so the split of the market is a shape you see before a number you read.
//
// It is also the product's one moment of motion. In a live round, buyers take the
// next free seat in the order they decide; when the last is in, the chamber sorts
// itself into blocs. A finished round is drawn straight into its blocs, in exactly
// the positions the sort ends on, so the hand-over from live to static is seamless.

import { buyerFace } from "./icons.js";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Seat positions for n seats in a box `width` wide. One row up to 7 seats, two rows
// after that. Seats per row follow each row's arc length, and the whole set is sorted
// by angle (left to right), which is what makes blocs come out as clean wedges.
export function layout(n, width, { seat } = {}) {
  const s = seat || (width < 420 ? 34 : width < 560 ? 40 : 46);
  const pad = 4;
  const rows = n <= 7 ? 1 : 2;
  const gap = s * 1.28;                      // distance between rows
  const perOuter = rows === 1 ? n : Math.ceil(n * 0.58);
  const needed = ((perOuter - 1) * s * 1.55) / Math.PI;
  const maxR = width / 2 - s / 2 - pad;
  // A floor on the radius, in seats, so a small panel still reads as a room.
  const R = Math.max(Math.min(Math.max(needed, s * (rows === 1 ? 2.9 : 4.3)), maxR), s * 1.6);
  const radii = Array.from({ length: rows }, (_, k) => R - k * gap);
  const total = radii.reduce((a, r) => a + r, 0);
  const counts = radii.map((r) => Math.round((n * r) / total));
  counts[0] += n - counts.reduce((a, c) => a + c, 0);
  const cx = width / 2, cy = R + s / 2 + pad;
  const seats = [];
  radii.forEach((r, k) => {
    const c = counts[k];
    for (let j = 0; j < c; j++) {
      const a = c === 1 ? Math.PI / 2 : Math.PI - (j * Math.PI) / (c - 1);
      seats.push({ a, r, x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) });
    }
  });
  seats.sort((p, q) => q.a - p.a || q.r - p.r);
  const inner = radii[radii.length - 1] - s / 2;
  return { seats, s, height: cy + s / 2 + pad, cx, cy, inner, radii };
}

// Faint tiers behind the seats and the floor line: the architecture of the room,
// drawn quietly so the people in it stay the loudest thing.
function tiers(L, width) {
  const arcs = L.radii.map((r) => `<path d="M ${(L.cx - r).toFixed(1)} ${L.cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(L.cx + r).toFixed(1)} ${L.cy.toFixed(1)}"/>`).join("");
  const R = L.radii[0] + L.s / 2 + 2;
  return `<svg class="arena-tiers" width="${width}" height="${L.height.toFixed(0)}" aria-hidden="true">${arcs}
    <line x1="${(L.cx - R).toFixed(1)}" x2="${(L.cx + R).toFixed(1)}" y1="${(L.cy + L.s / 2 + 1).toFixed(1)}" y2="${(L.cy + L.s / 2 + 1).toFixed(1)}"/></svg>`;
}

const place = (el, p, s) => { el.style.transform = `translate(${(p.x - s / 2).toFixed(1)}px, ${(p.y - s / 2).toFixed(1)}px)`; };

/* Draws a finished chamber.
   people: [{ id, name, segment, segIndex, color, dashed, label }], already in seating
           order, left to right (see seatOrder in the report code)
   center: { big, name, sub }  */
export function drawArena(host, { people, center, investigate = true, seat }) {
  host.classList.add("arena");
  host.classList.remove("is-live", "sorting");
  const seated = people;
  const render = () => {
    const w = host.clientWidth || 520;
    const L = layout(seated.length, w, { seat });
    host.style.height = `${L.height}px`;
    // Inside something already clickable (a case card), seats are pictures, not buttons.
    const tag = investigate ? "button" : "span";
    host.innerHTML = tiers(L, w) + seated.map((p) => `
      <${tag} class="seat${investigate ? "" : " still"}" ${investigate ? `type="button" data-investigate="buyer:${esc(p.id)}" aria-label="${esc(p.label)}"` : `aria-hidden="true"`}
        style="--tc:${p.color};width:${L.s}px;height:${L.s}px" data-seat="${esc(p.id)}" title="${esc(p.label)}">
        ${buyerFace(p, p.segIndex ?? 0, L.s, { tint: "currentColor", dashed: p.dashed })}</${tag}>`).join("")
      + centerHtml(center, L);
    [...host.querySelectorAll(".seat")].forEach((el, i) => place(el, L.seats[i], L.s));
  };
  render();
  observe(host, render);
}

function centerHtml(c, L) {
  if (!c) return "";
  const w = Math.max(L.inner * 1.7, 120);
  const h = Math.min(L.inner, 112);
  // The centre figure scales with the room inside the innermost row.
  const big = Math.round(Math.min(64, Math.max(26, L.inner * 0.5)));
  return `<div class="arena-center" style="left:${(L.cx - w / 2).toFixed(1)}px;width:${w.toFixed(1)}px;top:${(L.cy - h).toFixed(1)}px;height:${h.toFixed(1)}px;--ac:${big}px">
    ${c.name ? `<span class="ac-name">${c.name}</span>` : ""}
    <span class="ac-big">${c.big}</span>
    ${c.sub && L.inner >= 95 ? `<span class="ac-sub">${c.sub}</span>` : ""}
  </div>`;
}

// Re-lay out on resize, but only when the width actually changed.
function observe(host, render) {
  host._arenaObs?.disconnect();
  if (!("ResizeObserver" in window)) return;
  let last = host.clientWidth;
  const ro = new ResizeObserver(() => { if (Math.abs(host.clientWidth - last) > 4) { last = host.clientWidth; render(); } });
  ro.observe(host);
  host._arenaObs = ro;
}

/* A chamber that fills as buyers decide.
   people: every buyer, in segment order; they start as empty seats.
   seat: an optional seat size, the same option drawArena takes.
   Returns { take(id, color, dashed), sort(ids), setCenter(center) }. */
export function liveArena(host, { people, center, seat }) {
  host.classList.add("arena", "is-live");
  const w = host.clientWidth || 520;
  const L = layout(people.length, w, { seat });
  host.style.height = `${L.height}px`;
  host.innerHTML = tiers(L, w) + L.seats.map((p) => `<span class="seat-empty" style="width:${L.s}px;height:${L.s}px;transform:translate(${(p.x - L.s / 2).toFixed(1)}px,${(p.y - L.s / 2).toFixed(1)}px)"></span>`).join("")
    + people.map((p) => `<span class="seat live" data-seat="${esc(p.id)}" style="--tc:#C9C9C4;width:${L.s}px;height:${L.s}px;transform:translate(${(L.cx - L.s / 2).toFixed(1)}px,${(L.cy - L.s / 2).toFixed(1)}px)">${buyerFace(p, p.segIndex ?? 0, L.s, { tint: "currentColor" })}</span>`).join("")
    + `<div class="arena-center-slot">${centerHtml(center, L)}</div>`;
  const faces = Object.fromEntries([...host.querySelectorAll(".seat.live")].map((el) => [el.dataset.seat, el]));
  const taken = [];

  return {
    take(id, color, dashed) {
      const el = faces[id];
      if (!el || taken.includes(id)) return;
      const seat = L.seats[taken.length];
      taken.push(id);
      place(el, seat, L.s);
      el.style.setProperty("--tc", color);
      if (dashed) el.querySelector("circle:nth-of-type(2)")?.setAttribute("stroke-dasharray", "5 4");
      el.classList.add("seated");
    },
    setCenter(center) {
      const slot = host.querySelector(".arena-center-slot");
      if (slot) slot.innerHTML = centerHtml(center, L);
    },
    // Everyone moves to their bloc seat, the nearer seats first, so the chamber
    // settles from the middle out. Resolves when the movement has finished.
    // ids: the final seating order, the same one a finished chamber is drawn in.
    sort(ids) {
      host.classList.add("sorting");
      ids.forEach((id, i) => {
        const el = faces[id];
        if (!el) return;
        el.style.transitionDelay = reduced() ? "0ms" : `${i * 28}ms`;
        place(el, L.seats[i], L.s);
      });
      return new Promise((res) => setTimeout(res, reduced() ? 0 : 700 + ids.length * 28));
    },
  };
}

// The legend under a chamber: each bloc, its colour, and how many seats it holds.
export function arenaLegend(blocs, counts) {
  return `<div class="arena-legend">${blocs.map((b) => `
    <span class="al-item"><i class="al-sw" style="background:${b.color}"></i><span class="al-name">${esc(b.name)}</span><b class="al-n">${counts[b.key] ?? 0}</b></span>`).join("")}</div>`;
}
