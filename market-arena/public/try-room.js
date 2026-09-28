// "Which ad would you run?": the homepage's hands-on moment. You pick one of the three
// coffee ads and the room re-sorts around your pick: who would buy it, who went for
// another, who walked away, and what stopped the rest. Then change one thing (A's
// price) and see the room move.
//
// No model call and no cost: these are the recorded reactions from the same two real
// rounds the hero replays (round 2 is round 1 with only A's price cut).

import { ARENA, OBJ_LABEL } from "./arena-data.js";
import { liveArena } from "./arena.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLOR = { A: "var(--b1)", B: "var(--b2)", C: "var(--b3)" };
const OTHER = "#D3D3CE", WALK = "#EDEDE9";
const segs = [...new Set(ARENA.buyers.map((b) => b.segment))];
const people = ARENA.buyers.map((b) => ({ ...b, segIndex: segs.indexOf(b.segment) }));
const N = people.length;
const choiceIn = (round, id) => (round === 1 ? ARENA.round1.decisions[id].choice : ARENA.round2.decisions[id]);
const priceOf = (v, round) => (round === 1 ? v.priceR1 : v.priceR2);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function tryRoom(host) {
  let pick = null, round = 1, arena = null;
  host.innerHTML = `
    <div class="try-ads" role="radiogroup" aria-label="The three ads">
      ${ARENA.versions.map((v) => `<button type="button" role="radio" aria-checked="false" class="try-ad" data-v="${v.id}" style="--c:${COLOR[v.id]}">
        <span class="try-k"><i class="sw" style="background:${COLOR[v.id]}"></i>Version ${v.id}</span>
        <b>${esc(v.headline)}</b><span class="try-vp">${esc(v.valueProp)}</span>
        <span class="try-price" data-price="${v.id}">${esc(v.priceR1)}</span></button>`).join("")}
    </div>
    <div class="try-out">
      <div class="try-room" id="tryArena"></div>
      <p class="try-legend" id="tryLegend" aria-hidden="true"></p>
      <div class="try-read" id="tryRead" aria-live="polite"><p class="try-wait">Pick the ad you'd put money behind. The room will tell you who agrees.</p></div>
      <div class="try-change" id="tryChange" hidden>
        <button type="button" class="try-toggle" aria-pressed="false" id="tryToggle"><span class="tt-sw" aria-hidden="true"><i></i></span>Change one thing: cut A's price to ₹549</button>
        <p>That's round 2 of the same test, also real. Nothing else changed.</p>
      </div>
    </div>`;
  const $ = (s) => host.querySelector(s);

  function seatAll() {
    arena = liveArena($("#tryArena"), { people, center: { big: "?", sub: "pick an ad" }, seat: innerWidth < 720 ? 34 : 42 });
    people.forEach((p) => arena.take(p.id, "#C9C9C4"));
  }

  function render() {
    host.querySelectorAll(".try-ad").forEach((b) => {
      const on = b.dataset.v === pick;
      b.setAttribute("aria-checked", String(on)); b.classList.toggle("on", on);
      if (pick) b.tabIndex = on ? 0 : -1;
      const v = ARENA.versions.find((x) => x.id === b.dataset.v);
      const pr = b.querySelector(".try-price");
      pr.innerHTML = round === 2 && v.priceR1 !== v.priceR2 ? `<s>${esc(v.priceR1)}</s> ${esc(v.priceR2)}` : esc(priceOf(v, round));
      pr.classList.toggle("cut", round === 2 && v.priceR1 !== v.priceR2);
    });
    if (!pick) return;
    if (!arena) seatAll();
    const ch = (p) => choiceIn(round, p.id);
    const mine = people.filter((p) => ch(p) === pick);
    const walked = people.filter((p) => ch(p) === "none");
    const others = people.filter((p) => ch(p) !== pick && ch(p) !== "none");
    // Your pick first, then everyone who went elsewhere, then those who walked away.
    const order = [...mine, ...others, ...walked];
    host.querySelectorAll("#tryArena .seat").forEach((el) => {
      const p = people.find((x) => x.id === el.dataset.seat), c = ch(p);
      el.style.setProperty("--tc", c === pick ? COLOR[pick] : c === "none" ? WALK : OTHER);
      el.querySelector("circle:nth-of-type(2)")?.setAttribute("stroke-dasharray", c === "none" ? "5 4" : "");
      el.title = `${p.name}, ${p.segment}: ${c === "none" ? "walked away" : `chose ${c}`}`;
    });
    arena.sort(order.map((p) => p.id));
    arena.setCenter({ big: `${mine.length}`, sub: `of ${N} chose ${pick}` });
    $("#tryLegend").innerHTML = `<span><i style="background:${COLOR[pick]}"></i>Chose ${pick} ${mine.length}</span><span><i style="background:${OTHER}"></i>Chose another ${others.length}</span><span><i class="dash"></i>Walked away ${walked.length}</span>`;

    const tally = { A: 0, B: 0, C: 0 };
    people.forEach((p) => { if (ch(p) in tally) tally[ch(p)]++; });
    const top = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
    const lines = [`<p class="try-big"><b>${mine.length} of ${N}</b> would buy Version ${pick}.${top === pick ? " It's the room's pick." : ` The room went for ${top}, with ${tally[top]}.`}</p>`];
    if (round === 1) {
      // What put off everyone who didn't pick it, in their own answer about this ad.
      const rest = people.filter((p) => ch(p) !== pick), why = {};
      rest.forEach((p) => { const o = ARENA.round1.decisions[p.id].byBrand[pick]?.objection; if (o && o !== "none") why[o] = (why[o] || 0) + 1; });
      const [o, n] = Object.entries(why).sort((a, b) => b[1] - a[1])[0] || [];
      if (o) lines.push(`<p>What stopped the rest: <b>${esc(cap(OBJ_LABEL[o]))}</b>, for ${n} of the ${rest.length} who passed.</p>`);
    } else {
      // Who moved, by name: the change made visible one buyer at a time.
      const was = people.filter((p) => choiceIn(1, p.id) === pick).length, d = mine.length - was;
      const where = (k) => (k === "none" ? "walking away" : k);
      const came = people.filter((p) => choiceIn(2, p.id) === pick && choiceIn(1, p.id) !== pick).map((p) => `${p.name} came over from ${where(choiceIn(1, p.id))}`);
      const left = people.filter((p) => choiceIn(1, p.id) === pick && choiceIn(2, p.id) !== pick).map((p) => `${p.name} left for ${where(choiceIn(2, p.id))}`);
      const moved = [...came, ...left];
      lines.push(`<p>${d === 0 ? `The same ${was} as before the price cut.` : `${d > 0 ? "Up" : "Down"} from ${was} before the price cut.`}${moved.length ? ` ${esc(moved.join("; "))}.` : ""}</p>`);
    }
    $("#tryRead").innerHTML = lines.join("");
    $("#tryChange").hidden = false;
  }

  host.querySelector(".try-ads").addEventListener("click", (e) => {
    const b = e.target.closest(".try-ad"); if (!b) return;
    pick = b.dataset.v; render();
  });
  // Arrow keys move through the three, the way a radio group does.
  host.querySelector(".try-ads").addEventListener("keydown", (e) => {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const ids = ARENA.versions.map((v) => v.id), i = (ids.indexOf(pick ?? ids[0]) + (pick ? d : 0) + ids.length) % ids.length;
    pick = ids[i]; render(); host.querySelector(`.try-ad[data-v="${pick}"]`).focus();
  });
  host.querySelector(".try-ads .try-ad").tabIndex = 0;
  host.querySelectorAll(".try-ads .try-ad:not(:first-child)").forEach((b) => (b.tabIndex = -1));
  $("#tryToggle").addEventListener("click", () => {
    round = round === 1 ? 2 : 1;
    $("#tryToggle").setAttribute("aria-pressed", String(round === 2));
    render();
  });

  // The room fills when it first comes into view.
  const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); seatAll(); } }, { threshold: 0.3 });
  io.observe(host);
}
