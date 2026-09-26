// Rendering engine shared by Facilitate, Practice and the read-only shared view.
// Every page ships the same report markup (#results, #reportBar/#roundTabs/#reportNav,
// #sharebar, #legend, #pitches, #segments, #detail, #funnels, #heat, #objections,
// #suggestions, #changes, #deltas, #history, #meta) and keeps its own `rounds`
// array; this module owns which round is on screen and only touches those ids.
import { objectionIcon, stageIcon, segmentTint, buyerFace } from "./icons.js";
import { menuButton, ICON } from "./ui.js";
import { drawArena, liveArena, arenaLegend } from "./arena.js";
import { adMock, formatSwitch, formatOf } from "./ad-formats.js";
import { clearPush } from "./ad-parts.js";
import { EXTRA_FIELDS } from "./validate.js";
import { GOAL_BY_KEY } from "./goals.js";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const COLORS = ["var(--b1)", "var(--b2)", "var(--b3)", "var(--b4)"];
export const INK_ON = [false, false, false, true]; // text colour on each version swatch
export const HEX = ["#2F4BD1", "#9A3F7A", "#1E7F72", "#D9A21B"];
export const STAGES = [["attention", "Noticed"], ["interest", "Interested"], ["belief", "Believed"], ["purchase", "Bought"]];
// The same four stages said out loud, for the written summary.
const STAGE_PLAIN = { attention: "getting noticed", interest: "sounding appealing", belief: "being believed", purchase: "closing the choice" };
export const OBJ_LABEL = { price: "price feels too high", trust: "doesn't believe the claims", relevance: "doesn't fit their needs or habits", unclear: "doesn't understand the offer", none: "no real objection" };
export const OBJ_ORDER = ["price", "trust", "relevance", "unclear"];
// OBJ_LABEL stands alone in a table cell; it is not a noun phrase, so it cannot be
// dropped into a sentence. These two are the forms prose actually needs: a noun after
// "cite" or "held back by", and a full clause after "was that".
export const OBJ_NOUN = { price: "the price", trust: "doubt about the claims", relevance: "poor fit with their needs", unclear: "an unclear offer", none: "no real objection" };
export const OBJ_CLAUSE = { price: "the price feels too high", trust: "buyers don't believe the claims", relevance: "it doesn't fit their needs or habits", unclear: "buyers don't understand the offer", none: "buyers had no real objection" };
// OBJ_FIX reads after "Try testing …". The possessive slot in the hero needs a bare
// noun instead, or it renders "C's the price or how it's framed".
export const OBJ_LEVER = { price: "price", trust: "proof behind the claim", relevance: "sense of who it is speaking to", unclear: "explanation of the offer", none: "pitch" };
export const OBJ_FIX = { price: "the price or how it's framed", trust: "proof or credibility behind the claim", relevance: "who the message is speaking to", unclear: "how clearly the offer is explained" };
// Rounds saved before the engine returned counts don't carry them, so derive the
// count from the buyer records rather than showing nothing for an old round.
const panelOf = (r) => r.panel ?? r.customers.length;
const picksFor = (r, id) => {
  const src = id === "none" ? r.noPurchase : r.brands.find((b) => b.id === id);
  return src?.picks ?? r.customers.filter((c) => c.purchase === id).length;
};
// `purchase` is an argmax, so a buyer whose top two were nearly level is reported as
// having decided. Measurement says these are exactly the buyers who flip between
// identical runs, so name them instead of pretending the pick is firm.
const TOSSUP = .1;
// Rounds saved before the engine returned `margin` still have the distribution it
// was derived from, so recompute rather than reporting a gap of zero.
const marginOf = (c) => {
  if (c.margin != null) return c.margin;
  const v = Object.values(c.purchaseProbs || {}).sort((a, b) => b - a);
  return Math.round(((v[0] ?? 0) - (v[1] ?? 0)) * 1000) / 1000;
};
const isTossup = (c) => marginOf(c) < TOSSUP;

// Which version fields the round-over-round diff compares, in display order. The
// optional fields a project switched on are appended, so changing a call to action
// is reported as precisely as changing a headline. The set is fixed before round 1,
// so both rounds of any comparison always carry the same fields.
const CORE_DIFF = [["brand", "Name"], ["headline", "Headline"], ["valueProp", "Value proposition"], ["price", "Price"]];
const diffFields = (r) => [
  ...CORE_DIFF,
  ...EXTRA_FIELDS.filter((f) => r?.brands?.some((b) => b.extras && b.extras[f.key] != null)).map((f) => [`extras.${f.key}`, f.label]),
];
const fieldValue = (b, key) => (key.startsWith("extras.") ? b?.extras?.[key.slice(7)] : b?.[key]);

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pct = (x) => Math.round(x * 100) + "%";
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const $ = (s) => document.querySelector(s);
const has = (s) => Boolean(document.querySelector(s));

// Colour for "bought nothing": a neutral grey, so it never reads as a fifth version.
const NONE_COLOR = "#8E8E95";
// The strongest a heat-map tile gets, in percent of its colour: light enough that
// ink figures stay readable on the darkest tile, and the key uses the same scale.
const HEAT_MAX = { seg: 50, obj: 40 };

// What did the work in one ad: the part buyers most often named as what made them
// want it, a runner-up worth marking, and the part that put them off, but only when
// one clearly stands out (see clearPush). Rounds run before this existed have no parts.
const PULL_MIN = 0.15;
export function workOf(b) {
  if (!b?.parts?.length || !b.pull) return null;
  const ranked = b.parts.map((p) => ({ ...p, v: b.pull[p.key] ?? 0 })).sort((x, y) => y.v - x.v);
  const top = ranked[0]?.v >= PULL_MIN ? ranked[0] : null;
  const second = top && ranked[1]?.v >= PULL_MIN ? ranked[1] : null;
  const cp = clearPush(b.push);
  const push = cp ? { ...b.parts.find((p) => p.key === cp.key), v: cp.share } : null;
  return { top, second, push };
}
const quoteOf = (t, n = 64) => `“${t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t}”`;

// `readOnly` is for the shared view, which has no editor to send anyone to.
export function createResultsView({ readOnly = false, onFormat = null, getFormat = null } = {}) {
  let open = null;
  let format = null;    // the format picked in this report; null means the round's own
  let viewIndex = null; // null means "whatever the latest round is"
  let current = null;   // the round on screen, so the drawer investigates what is shown
  let getRounds = () => [];

  const indexFor = (rounds) => viewIndex == null ? rounds.length - 1 : Math.min(Math.max(viewIndex, 0), rounds.length - 1);
  const viewedRound = () => { const rounds = getRounds(); return rounds.length ? rounds[indexFor(rounds)] : null; };

  function deltaChip(now, before) {
    if (before == null) return "";
    const d = Math.round((now - before) * 100);
    if (d === 0) return `<span class="delta flat">±0</span>`;
    return `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${Math.abs(d)} pts</span>`;
  }
  // Versions are matched across rounds by slot, not by id: ids are positional
  // per round, so adding or removing one mid-session would otherwise silently
  // compare two different versions.
  const bySlot = (round, slot) => { const i = round.slots.indexOf(slot); return i < 0 ? null : round.brands[i]; };

  function detailHtml(c, r) {
    return `<button class="x" id="closeDetail">Close</button><h3>${esc(c.name)}, ${esc(c.segment.toLowerCase())}</h3><p>${esc(c.profile)}</p><div class="tablewrap"><table><thead><tr><th>Version</th><th class="n">Noticed</th><th class="n">Interested</th><th class="n">Believed</th><th class="n">Would buy</th><th>Main objection</th></tr></thead><tbody>` +
      r.brands.map((b) => { const x = c.byBrand[b.id];
        return `<tr><td>${esc(b.brand)}</td><td class="num">${pct(x.attention)}</td><td class="num">${pct(x.appeal)}</td><td class="num">${pct(x.belief)}</td><td class="num">${pct(c.purchaseProbs[b.id] || 0)}</td><td>${OBJ_LABEL[x.objection]}</td></tr>`; }).join("") +
      `</tbody></table></div>`;
  }
  function showDetail() {
    const r = viewedRound();
    const d = $("#detail");
    document.querySelectorAll(".person").forEach((x) => x.setAttribute("aria-expanded", String(x.dataset.p === open)));
    const c = r?.customers.find((x) => x.id === open);
    d.classList.toggle("hidden", !c);
    d.innerHTML = c ? detailHtml(c, r) : "";
  }

  function showSkeleton() {
    $("#results").classList.remove("hidden");
    if (has("#ghost")) $("#ghost").classList.add("hidden");
    ["#csv", "#pdf", "#share"].forEach((id) => { if (has(id)) $(id).disabled = true; });
    $("#flags").innerHTML = "";
    // The Overview gets its own loading state: the panel of faces, waiting to decide.
    if (has("#hero")) {
      $("#hero").classList.remove("hidden");
      $("#hero").innerHTML = `<div class="hero-body" aria-busy="true">
        <p class="hero-running">The buyers are reading your ads…</p>
        <i class="skel" style="height:40px;width:52%;margin:0 0 14px"></i>
        <i class="skel" style="height:16px;width:78%;margin:0 0 26px"></i>
        <div class="votewall">${Array.from({ length: 4 }).map(() => `<div class="vw-seg"><div class="vw-faces">
          ${Array.from({ length: 3 }).map(() => `<i class="skel vw-skel"></i>`).join("")}</div><i class="skel" style="height:12px;width:70%"></i></div>`).join("")}</div>
      </div>`;
      activeTab = "overview";
      renderTabs();
    }
    $("#marketTitle").textContent = "Reading the room…";
    $("#sharebar").innerHTML = `<div class="skel" style="width:100%;height:100%;border-radius:0"></div>`;
    $("#legend").innerHTML = Array.from({ length: 3 }).map(() => `<i class="skel" style="width:110px;height:26px"></i>`).join("");
    $("#segments").innerHTML = Array.from({ length: 4 }).map(() => `
      <div class="seg"><i class="skel skel-head"></i><div class="people">
        ${Array.from({ length: 3 }).map(() => `<div class="skel-row"><i class="skel skel-token"></i><i class="skel skel-line"></i></div>`).join("")}
      </div></div>`).join("");
    $("#detail").classList.add("hidden");
    $("#explain").innerHTML = ""; $("#heatKey").innerHTML = "";
    $("#pitches").innerHTML = ""; $("#funnels").innerHTML = ""; $("#heat").innerHTML = "";
    $("#objections").innerHTML = ""; $("#segInsights").innerHTML = "";
    ["#pitchSec", "#suggestSec", "#changesSec", "#deltaSec"].forEach((s) => { if (has(s)) $(s).classList.add("hidden"); });
    if (has("#contextSec")) $("#contextSec").classList.add("hidden");
  }


  /* ---- The round, live ---------------------------------------------------------
     Every buyer is a separate request, so they finish at different moments. The
     server streams each decision as it lands and each buyer takes the next free seat
     in the arena, in that real order. The model is fast (a whole panel often decides
     in a third of a second), so arrivals are paced to one every REVEAL_MS: the order
     is the model's, only the spacing is ours, and the copy says "in the order they
     decided" rather than claiming each seat is the instant it happened. When the
     round is in, the chamber sorts itself into blocs by choice. */
  const REVEAL_MS = 150;
  let live = null;
  function showLive(personas, versions) {
    showSkeleton();
    if (!has("#hero")) return;
    const segs = [...new Set(personas.map((p) => p.segment))];
    const people = personas.map((p) => ({ ...p, segIndex: segs.indexOf(p.segment) }));
    live = {
      colorOf: { ...Object.fromEntries(versions.map((v) => [v.id, v.color])), none: NONE_COLOR },
      nameOf: { ...Object.fromEntries(versions.map((v) => [v.id, v.name])), none: "nothing" },
      n: personas.length, done: 0, queue: [], timer: null, idle: [], arena: null,
    };
    $("#hero").innerHTML = `<div class="hero-body" aria-busy="true">
      <div class="hero-grid">
        <div class="hero-main">
          <p class="live-status"><span class="live-dot" aria-hidden="true"></span><span id="liveCount" aria-live="polite">0 of ${personas.length} buyers have decided</span></p>
          <h2 class="hero-verdict">The buyers are reading your ads</h2>
          <p class="hero-sub" id="liveLast">Each buyer takes a seat as they decide, in the order they decided, coloured by the version they chose.</p>
          <div class="vw-key">${versions.map((v) => `<span><i class="sw" style="background:${v.color}"></i>${esc(v.name)}</span>`).join("")}
            <span><i class="sw" style="background:${NONE_COLOR}"></i>Bought nothing</span></div>
        </div>
        <div class="hero-arena"><div id="heroArena"></div></div>
      </div>
    </div>`;
    live.arena = liveArena($("#heroArena"), { people, center: { big: "0", sub: `of ${personas.length} decided` } });
  }
  function liveDecided(b) {
    if (!live) return;
    live.queue.push(b);
    if (!live.timer) pump();
  }
  function pump() {
    const b = live.queue.shift();
    if (!b) { live.timer = null; live.idle.splice(0).forEach((f) => f()); return; }
    reveal(b);
    live.timer = setTimeout(pump, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : REVEAL_MS);
  }
  // Resolves once every buyer that has arrived is seated, so the verdict never lands
  // before the last buyer has been shown deciding.
  function liveFinish() {
    if (!live || (!live.timer && !live.queue.length)) return Promise.resolve();
    return new Promise((res) => live.idle.push(res));
  }
  function reveal(b) {
    live.arena?.take(b.id, live.colorOf[b.purchase] || NONE_COLOR, b.margin < TOSSUP);
    live.done += 1;
    live.arena?.setCenter({ big: String(live.done), sub: `of ${live.n} decided` });
    const count = $("#liveCount"), last = $("#liveLast");
    if (count) count.textContent = `${live.done} of ${live.n} buyers have decided`;
    if (last) last.textContent = `${b.name}, ${b.segment.toLowerCase()}, ${b.purchase === "none" ? "walked away" : `chose ${live.nameOf[b.purchase] || b.purchase}`}${b.margin < TOSSUP ? ", only just" : ""}.`;
  }
  // The round is in: the chamber sorts itself into blocs, then the report takes over
  // with the chamber drawn in exactly those seats.
  async function liveSort(r) {
    if (!live?.arena) return;
    const last = $("#liveLast");
    if (last) last.textContent = "Everyone has decided. Sorting the room by choice.";
    await live.arena.sort(seatOrder(r).map((c) => c.id));
    live = null;
  }

  // Seating order for a finished round: blocs by outright picks (most on the left,
  // "bought nothing" always on the right), then each buyer's place in the panel.
  function blocsFor(r) {
    const slotOf = (id) => r.slots[r.brands.findIndex((b) => b.id === id)];
    const picks = (id) => picksFor(r, id);
    const versions = [...r.brands].sort((a, b) => picks(b.id) - picks(a.id) || b.share - a.share)
      .map((b) => ({ key: b.id, name: b.brand, color: COLORS[slotOf(b.id)] }));
    return [...versions, { key: "none", name: "Bought nothing", color: NONE_COLOR }];
  }
  function seatOrder(r) {
    const order = blocsFor(r).map((b) => b.key);
    return r.customers.map((c, i) => ({ c, i }))
      .sort((p, q) => order.indexOf(p.c.purchase) - order.indexOf(q.c.purchase) || p.i - q.i)
      .map((x) => x.c);
  }

  /* ---- The result hero -------------------------------------------------------
     Everything below it is evidence for the two things stated here: what happened,
     and what to do next. Built from the same numbers the sections use, so the hero
     can never disagree with the report underneath it. */
  function renderHero(r, prev, idx, total, animate = false) {
    if (!has("#hero")) return;
    const n = panelOf(r);
    const ranked = [...r.brands].sort((a, b) => b.share - a.share);
    const win = ranked[0], second = ranked[1];
    const gap = Math.round((win.share - second.share) * 100);
    const tied = gap < 5;
    const slotOf = (b) => r.slots[r.brands.findIndex((x) => x.id === b.id)];
    const colorOf = (id) => id === "none" ? NONE_COLOR : COLORS[slotOf(r.brands.find((b) => b.id === id))];
    const nameOf = (id) => id === "none" ? "nothing" : r.brands.find((b) => b.id === id)?.brand || id;

    // The objection that costs the leader most, which is also the tile the user clicks.
    const [objKey, objVal] = Object.entries(win.objections || {})
      .filter(([k]) => k !== "none").sort((a, b) => b[1] - a[1])[0] || ["none", 0];

    const verdict = tied
      ? `${esc(win.brand)} and ${esc(second.brand)} are tied`
      : `${esc(win.brand)} leads this round`;
    const sub = tied
      ? `${pct(win.share)} against ${pct(second.share)}, inside the noise of a re-run, so this round does not separate them. ${cap(OBJ_NOUN[objKey])} is the objection to attack first.`
      : `${pct(win.share)} average choice probability, ${gap} points clear. ${cap(OBJ_NOUN[objKey])} is the objection holding it back.`;

    const bars = [...ranked.map((b) => ({ id: b.id, nm: b.brand, v: b.share, c: COLORS[slotOf(b)], none: false })),
                  { id: "none", nm: "Bought nothing", v: r.noPurchase.share, none: true }];

    const blocs = blocsFor(r);
    const counts = Object.fromEntries(blocs.map((b) => [b.key, picksFor(r, b.key)]));
    $("#hero").classList.remove("hidden");
    $("#hero").innerHTML = `
      <div class="hero-body">
        ${(() => {
          const g = GOAL_BY_KEY[r.goal];
          if (!g) return "";
          // The brief is answered in its own terms, from this round's numbers, before
          // the general verdict, otherwise the question the user asked gets buried.
          return `<div class="hero-brief">
            <span class="bq">You asked: ${esc(g.q)}</span>
            <p class="ba">${g.answer(r)}</p>
            ${r.goalNote ? `<p class="bn">Your note before the run: “${esc(r.goalNote)}”</p>` : ""}
          </div>`;
        })()}
        <div class="hero-grid">
        <div class="hero-main">
        <h2 class="hero-verdict">${verdict}</h2>
        <p class="hero-sub">${sub}</p>
        </div>

        <div class="hero-tiles">
          <button class="hero-tile probe-tile" type="button" data-investigate="share:${win.id}" style="--tc:${COLORS[slotOf(win)]}">
            <span class="k">Leading version</span>
            <span class="v">${pct(win.share)}</span>
            <span class="n">${esc(win.brand)}, picked outright by ${picksFor(r, win.id)} of ${n} buyers</span>
          </button>
          <button class="hero-tile probe-tile" type="button" data-investigate="obj:${objKey}:${win.id}">
            <span class="k">Top objection</span>
            <span class="v">${pct(objVal)}</span>
            <span class="n">${cap(OBJ_NOUN[objKey])}, against ${esc(win.brand)}</span>
          </button>
          <button class="hero-tile probe-tile" type="button" data-investigate="share:none">
            <span class="k">Bought nothing</span>
            <span class="v">${pct(r.noPurchase.share)}</span>
            <span class="n">${picksFor(r, "none")} of ${n} walked away outright</span>
          </button>
        </div>
        <div class="hero-arena">
          <div id="heroArena" role="group" aria-label="The ${n} buyers, seated by the version they chose"></div>
          ${arenaLegend(blocs, counts)}
          <p class="arena-hint">Each seat is a buyer. Select one to see how they decided.${r.customers.some(isTossup) ? ` <span class="ah-dash"><i aria-hidden="true"></i>Dashed: too close to call.</span>` : ""}</p>
        </div>
        </div>

        <p class="hero-barlab">Average choice probability <button class="whatis" data-def="share" aria-label="What does average choice probability mean?">?</button></p>
        <div class="hero-bars">
          ${bars.map((b) => `
            <button class="hero-bar ${b.none ? "none" : ""}" type="button" data-investigate="share:${b.id}" ${b.c ? `style="--c:${b.c}"` : ""}>
              <span class="nm">${esc(b.nm)}</span><span class="pc">${pct(b.v)}</span>
              <span class="track"><span class="fill" style="width:${pct(b.v)}"></span></span>
            </button>`).join("")}
        </div>

        <div class="hero-next">
          <h3>Next test</h3>
          <p>${workOf(win)?.push
            ? `Rewrite <b>${esc(win.brand)}</b>'s ${esc(workOf(win).push.label.replace(/^The /, "").toLowerCase())}, ${esc(quoteOf(workOf(win).push.text, 60))}, which put off ${pct(workOf(win).push.v)} of buyers, and hold everything else, so the next round measures that one change and nothing else.`
            : `Change <b>${esc(win.brand)}</b>'s ${esc(OBJ_LEVER[objKey] || "pitch")} and hold everything else, so the next round measures that one change and nothing else.`}</p>
          ${(() => { const w = workOf(win); if (!w || (!w.top && !w.push)) return "";
            return `<div class="keepfix">
              ${w.top ? `<button type="button" class="kf" data-investigate="part:${win.id}:${w.top.key}"><span class="kf-k">Keep</span><i class="k-hl"></i><span class="kf-t">${esc(quoteOf(w.top.text, 70))}</span><span class="kf-v">convinced ${pct(w.top.v)}</span></button>` : ""}
              ${w.push ? `<button type="button" class="kf" data-investigate="part:${win.id}:${w.push.key}"><span class="kf-k">Fix</span><i class="k-wave"></i><span class="kf-t">${esc(quoteOf(w.push.text, 70))}</span><span class="kf-v">put off ${pct(w.push.v)}</span></button>` : ""}
            </div>`; })()}
          <div class="hero-actions">
            ${readOnly ? "" : `<button class="btn" data-prepare-round>Edit versions for round ${total + 1}</button>`}
            <button class="hero-explore" type="button" data-tab-go="market">See how the market split</button>
          </div>
        </div>
      </div>`;
    const segIdx = (c) => r.segments.indexOf(c.segment);
    drawArena($("#heroArena"), {
      people: seatOrder(r).map((c) => ({
        ...c, segIndex: segIdx(c), color: colorOf(c.purchase), dashed: isTossup(c),
        label: `${c.name}, ${c.segment}, ${c.purchase === "none" ? "bought nothing" : `chose ${nameOf(c.purchase)}`}${isTossup(c) ? ", too close to call" : ""}`,
      })),
      center: { name: `<i class="sw" style="background:${COLORS[slotOf(win)]}"></i>${esc(win.brand)}`, big: pct(win.share), sub: tied ? `tied with ${esc(second.brand)}` : "average choice probability" },
    });
  }


  /* ---- Investigation drawer ---------------------------------------------------
     A number in this report is a claim; clicking it should show the evidence behind
     the claim and offer the experiment that would settle it. The drawer is fixed, so
     opening it never reflows the page under the reader's cursor.

     What it can show is bounded by what the model returns. Jev answers typed
     questions, so per buyer we have: which objection they picked from a fixed set,
     how they scored each stage, and their full probability across every version.
     We do NOT have free-text reasoning, and this panel never invents any. */

  const DEFS = {
    share: ["Average choice probability", "Across all buyers, the mean likelihood each one would pick this version. A buyer leaning 40/35/25 contributes to all three, which is why these add up to 100% and why they differ from outright picks."],
    picks: ["Outright picks", "How many buyers had this version as their single top choice. Reconciles with the buyer cards, but throws away everything except the winner, so one undecided buyer moves it by a whole buyer."],
    attention: ["Noticed", "Would this buyer stop scrolling to read the ad at all."],
    interest: ["Interested", "How appealing the offer is to this buyer, given their needs, habits and budget."],
    belief: ["Believed", "Would this buyer find the claims credible."],
    purchase: ["Would buy", "This buyer's probability of choosing this version over the others and over buying nothing."],
  };

  let drawerEl = null, scrimEl = null, lastFocus = null;
  // Evidence can lead to more evidence: a number opens its buyers, a buyer opens
  // their decision. The stack is what "Back" returns to.
  let drawerStack = [];

  function ensureDrawer() {
    if (drawerEl) return;
    scrimEl = Object.assign(document.createElement("div"), { className: "drawer-scrim" });
    drawerEl = Object.assign(document.createElement("aside"), { className: "drawer" });
    drawerEl.setAttribute("role", "dialog");
    drawerEl.setAttribute("aria-modal", "true");
    drawerEl.setAttribute("aria-label", "Investigation");
    document.body.append(scrimEl, drawerEl);
    scrimEl.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawerEl.classList.contains("open")) closeDrawer(); });
  }
  function openDrawer(html) {
    ensureDrawer();
    const already = drawerEl.classList.contains("open");
    if (already) drawerStack.push({ html: drawerEl.innerHTML, scroll: drawerEl.querySelector(".drawer-body")?.scrollTop || 0 });
    else { drawerStack = []; lastFocus = document.activeElement; }
    paintDrawer(html);
    requestAnimationFrame(() => { scrimEl.classList.add("open"); drawerEl.classList.add("open"); });
  }
  function paintDrawer(html, scroll = 0) {
    drawerEl.innerHTML = html;
    // A face that flew in waits in its seat's place only while its buyer is showing.
    if (flight && !drawerEl.querySelector(`.dh-face[data-buyer="${CSS.escape(flight.id)}"]`)) { flight.src.style.visibility = ""; flight = null; }
    if (drawerStack.length) drawerEl.querySelector(".drawer-head")?.insertAdjacentHTML("afterbegin",
      `<button class="drawer-back" type="button" aria-label="Back">${ICON.chevron}</button>`);
    const body = drawerEl.querySelector(".drawer-body");
    if (body) body.scrollTop = scroll;
    (drawerEl.querySelector(".drawer-back") || drawerEl.querySelector(".drawer-x"))?.focus();
  }
  function drawerBack() {
    const prev = drawerStack.pop();
    if (prev) paintDrawer(prev.html, prev.scroll);
  }
  function closeDrawer() {
    if (!drawerEl) return;
    // The buyer goes back to their seat as the panel leaves.
    if (flight) {
      const { src, id } = flight; flight = null;
      const face = drawerEl.querySelector(`.dh-face[data-buyer="${CSS.escape(id)}"] .buyerface`);
      if (face && src.isConnected && onScreen(src)) flyFace(face, src.getBoundingClientRect(), { from: face.getBoundingClientRect(), color: getComputedStyle(src).color })
        .then(() => { src.style.visibility = ""; });
      else src.style.visibility = "";
    }
    scrimEl.classList.remove("open"); drawerEl.classList.remove("open");
    drawerStack = [];
    lastFocus?.focus?.();
  }

  /* ---- Motion that connects places -------------------------------------------
     Opening a buyer lifts their face out of the seat (or row) that was selected and
     flies it into the head of the panel; closing sends it back. It is one element
     moving between two places, so the reader never loses who they were looking at.
     Nothing moves under reduced motion. */
  let flight = null;   // { src, id }: the face lifted from the page, hidden until it returns
  const onScreen = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; };
  // Moves a copy of `svg` from one rectangle to another, above everything.
  function flyFace(svg, to, { from, color, duration = 460 } = {}) {
    const a = from || svg.getBoundingClientRect();
    const ghost = svg.cloneNode(true);
    Object.assign(ghost.style, { position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
      margin: 0, zIndex: 80, pointerEvents: "none", color: color || getComputedStyle(svg).color, transformOrigin: "0 0", visibility: "visible",
      filter: "drop-shadow(0 6px 14px rgba(20,20,24,.18))" });
    ghost.removeAttribute("aria-label"); ghost.setAttribute("aria-hidden", "true");
    document.body.append(ghost);
    const k = to.width / a.width;
    const anim = ghost.animate([
      { transform: "translate(0,0) scale(1)" },
      { transform: `translate(${(to.left - a.left) * 0.5}px,${(to.top - a.top) * 0.5 - 28}px) scale(${(1 + k) / 2 * 1.08})`, offset: 0.5 },
      { transform: `translate(${to.left - a.left}px,${to.top - a.top}px) scale(${k})` },
    ], { duration, easing: "cubic-bezier(.4,0,.2,1)" });
    return anim.finished.catch(() => {}).then(() => ghost.remove());
  }
  // Where an element inside the drawer will be once the drawer has finished sliding in.
  function settledRect(el) {
    const b = el.getBoundingClientRect(), d = drawerEl.getBoundingClientRect();
    return { left: b.left - d.left + drawerEl.offsetLeft, top: b.top - d.top + drawerEl.offsetTop, width: b.width, height: b.height };
  }
  function flyIntoDrawer(src, id) {
    const target = drawerEl.querySelector(`.dh-face[data-buyer="${CSS.escape(id)}"] .buyerface`);
    if (!src || !target || reducedMotion() || !onScreen(src) || drawerEl.contains(src)) return;
    const to = settledRect(target);
    target.style.visibility = "hidden";
    src.style.visibility = "hidden";
    flight = { src, id };
    flyFace(src, to, { from: src.getBoundingClientRect() }).then(() => { target.style.visibility = ""; });
  }

  const shell = (kick, title, body, face = "") => `
    <div class="drawer-head">${face}
      <div class="dh"><span class="drawer-kick">${esc(kick)}</span><h3>${title}</h3></div>
      <button class="drawer-x" aria-label="Close">×</button>
    </div>
    <div class="drawer-body">${body}</div>`;

  // Every version this buyer weighed, not just the one they picked.
  function alternatives(r, c) {
    const rows = r.brands.map((b) => ({
      nm: b.brand, v: c.purchaseProbs[b.id] ?? 0,
      c: COLORS[r.slots[r.brands.findIndex((x) => x.id === b.id)]], pick: c.purchase === b.id,
    }));
    rows.push({ nm: "Bought nothing", v: c.purchaseProbs.none ?? 0, c: "var(--none)", pick: c.purchase === "none" });
    rows.sort((a, b) => b.v - a.v);
    return `<div class="dalt"><span class="dalt-lab">What else they weighed</span>${rows.map((x) => `
      <div class="dalt-row ${x.pick ? "pick" : ""}" style="--c:${x.c}">
        <span>${esc(x.nm)}</span><span class="t"><i style="width:${pct(x.v)}"></i></span><span class="p">${pct(x.v)}</span>
      </div>`).join("")}</div>`;
  }

  // Which field a given objection actually implicates, so the experiment is specific.
  const FIELD_FOR = { price: ["price", "Price"], trust: ["valueProp", "Value proposition"], relevance: ["headline", "Headline"], unclear: ["headline", "Headline"] };

  function investigateObjection(r, key, brandId) {
    const b = r.brands.find((x) => x.id === brandId) || [...r.brands].sort((x, y) => y.share - x.share)[0];
    const segs = [...new Set(r.customers.map((c) => c.segment))];
    const cited = r.customers
      .map((c) => ({ c, rate: c.byBrand[b.id]?.objection === key ? 1 : 0 }))
      .filter((x) => x.rate).map((x) => x.c);
    const [field, fieldLabel] = FIELD_FOR[key] || ["headline", "Headline"];

    const body = `
      <p class="drawer-lede">${pct(b.objections[key])} of the panel's objection weight against <b>${esc(b.brand)}</b> sits on ${OBJ_NOUN[key]}. ${cited.length
        ? `${cited.length} of ${panelOf(r)} buyers named it as their single biggest reason not to buy.`
        : `No single buyer named it as their biggest reason, so it is spread thinly rather than concentrated.`}</p>

      <h4>The buyers behind the number</h4>
      ${cited.length ? cited.map((c) => `
        <div class="dbuyer" style="--seg:${segmentTint(segs.indexOf(c.segment))}">
          <div class="dbuyer-top">${buyerFace(c, segs.indexOf(c.segment), 32)}<b>${esc(c.name)}</b><span class="dbuyer-seg">${esc(c.segment)}</span>
            <span class="dbuyer-rate">${pct(c.purchaseProbs[b.id] ?? 0)}</span></div>
          <p class="dbuyer-prof">${esc(c.profile)}</p>
          ${alternatives(r, c)}
        </div>`).join("")
        : `<div class="nodata">No buyer ranked this as their top objection to ${esc(b.brand)}. The ${pct(b.objections[key])} is the average weight across the panel, so it is a broad unease rather than a blocker for anyone in particular. Attack a concentrated objection first.</div>`}

      <div class="hypo">
        <h4>Test this hypothesis</h4>
        <p>If ${OBJ_NOUN[key]} is what is costing <b>${esc(b.brand)}</b> the round, changing its ${fieldLabel.toLowerCase()} and holding everything else should move its share. If it does not, the objection is not the binding constraint.</p>
        <p class="hypo-was">Currently: <s>${esc(b[field] || "—")}</s></p>
        <span class="fieldname">New ${fieldLabel.toLowerCase()} for ${esc(b.brand)}</span>
        <textarea id="hypoText" spellcheck="true">${esc(b[field] || "")}</textarea>
        ${readOnly ? "" : `<button class="btn-primary hypo-go" data-apply-hypo data-slot="${r.slots[r.brands.findIndex((x) => x.id === b.id)]}" data-field="${field}">Use this in the next round</button>`}
      </div>`;
    openDrawer(shell(`${b.brand}: ${OBJ_LABEL[key]}`, `Why ${esc(b.brand)} loses people`, body));
  }

  function investigateBuyer(r, id, src) {
    const c = r.customers.find((x) => x.id === id);
    if (!c) return;
    const segs = [...new Set(r.customers.map((c2) => c2.segment))];
    const nameOfId = (pid) => pid === "none" ? "nothing" : r.brands.find((b) => b.id === pid)?.brand || pid;
    const body = `
      <p class="drawer-lede">${esc(c.profile)}</p>
      <h4>Their decision</h4>
      <p>Chose <b>${esc(nameOfId(c.purchase))}</b>${isTossup(c)
        ? ` — but only just. Their top two were ${Math.round(marginOf(c) * 100)} points apart, close enough that an identical re-run could land differently.`
        : `, ahead of their second choice by ${Math.round(marginOf(c) * 100)} points.`}</p>
      ${alternatives(r, c)}
      <h4>How they scored each version</h4>
      <div class="tablewrap"><table><thead><tr><th>Version</th>
        ${STAGES.map(([k, lab]) => `<th class="n">${lab} <span class="whatis" title="${esc(DEFS[k][1])}">?</span></th>`).join("")}
        <th>Objection</th></tr></thead><tbody>
        ${r.brands.map((b) => { const x = c.byBrand[b.id]; return `<tr><td>${esc(b.brand)}</td>
          <td class="num">${pct(x.attention)}</td><td class="num">${pct(x.appeal)}</td><td class="num">${pct(x.belief)}</td>
          <td class="num">${pct(c.purchaseProbs[b.id] || 0)}</td><td>${cap(OBJ_NOUN[x.objection])}</td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="drawer-lede" style="margin-top:16px;font-size:var(--t-small)">These are the model's answers to five typed questions about this buyer. It returns choices and scores, not written reasoning, so nothing here is a quote or an explanation the buyer gave.</p>`;
    const face = `<span class="dh-face" data-buyer="${esc(c.id)}" style="color:${colorFor(r, c.purchase)}">${buyerFace(c, segs.indexOf(c.segment), 52, { tint: "currentColor", dashed: isTossup(c) })}</span>`;
    openDrawer(shell(`${c.segment}`, esc(c.name), body, face));
    if (src) flyIntoDrawer(src, c.id);
  }

  // One row per buyer: face, who they are, a bar for the number in question, and
  // what they actually chose. Each row opens that buyer.
  function buyerRows(r, rows, { color, note }) {
    const segs = r.segments;
    return `<div class="erows">${rows.map(({ c, v }) => `
      <button class="erow" type="button" data-investigate="buyer:${c.id}">
        ${buyerFace(c, segs.indexOf(c.segment), 30)}
        <span class="erow-who"><b>${esc(c.name)}</b><span>${esc(c.segment)}${note ? `, ${note(c)}` : ""}</span></span>
        <span class="erow-bar"><i style="width:${pct(v)};background:${color}"></i></span>
        <span class="erow-v">${pct(v)}</span>
      </button>`).join("")}</div>`;
  }
  const colorFor = (r, id) => id === "none" ? NONE_COLOR : COLORS[r.slots[r.brands.findIndex((b) => b.id === id)]];
  const choiceName = (r, id) => id === "none" ? "nothing" : r.brands.find((b) => b.id === id)?.brand || id;

  // A share figure: the average of every buyer's probability, so the evidence is
  // every buyer's probability, highest first, and how it splits by segment.
  function investigateShare(r, id) {
    const none = id === "none";
    const b = none ? null : r.brands.find((x) => x.id === id);
    if (!none && !b) return;
    const name = none ? "Bought nothing" : b.brand;
    const share = none ? r.noPurchase.share : b.share;
    const bySeg = none ? r.noPurchase.bySegment : b.bySegment;
    const n = panelOf(r), picks = picksFor(r, id);
    const rows = r.customers.map((c) => ({ c, v: c.purchaseProbs[id] ?? 0 })).sort((x, y) => y.v - x.v);
    const body = `
      <p class="drawer-lede">${pct(share)} is the average of all ${n} buyers' chance of ${none ? "buying nothing" : `picking ${esc(name)}`}.
        ${picks} of ${n} ${none ? "walked away outright" : "picked it outright"}. A buyer counts towards the average even when it was not their top choice.</p>
      <h4>Every buyer's chance</h4>
      ${buyerRows(r, rows, { color: colorFor(r, id), note: (c) => c.purchase === id ? `<em>${none ? "walked away" : "picked it"}</em>` : `picked ${esc(choiceName(r, c.purchase))}` })}
      <h4>By segment</h4>
      <div class="dalt">${r.segments.map((s) => `
        <button class="dalt-row" type="button" data-investigate="seg:${r.segments.indexOf(s)}:${id}" style="--c:${colorFor(r, id)}">
          <span>${esc(s)}</span><span class="t"><i style="width:${pct(bySeg[s] ?? 0)}"></i></span><span class="p">${pct(bySeg[s] ?? 0)}</span>
        </button>`).join("")}</div>`;
    openDrawer(shell(none ? "Walk-aways" : "Average choice probability", `${esc(name)}: ${pct(share)}`, body));
  }

  // A funnel figure: the average of one stage's score across buyers.
  const STAGE_SCORE = { attention: (c, id) => c.byBrand[id].attention, interest: (c, id) => c.byBrand[id].appeal,
    belief: (c, id) => c.byBrand[id].belief, purchase: (c, id) => c.purchaseProbs[id] ?? 0 };
  function investigateStage(r, stage, id) {
    const b = r.brands.find((x) => x.id === id);
    if (!b || !STAGE_SCORE[stage]) return;
    const [label, def] = DEFS[stage];
    const rows = r.customers.map((c) => ({ c, v: STAGE_SCORE[stage](c, id) })).sort((x, y) => y.v - x.v);
    const low = rows.filter((x) => x.v < .4).length;
    const body = `
      <p class="drawer-lede">${def} ${pct(b.funnel[stage])} is the average across ${panelOf(r)} buyers for ${esc(b.brand)}.
        ${low ? `${low} buyer${low === 1 ? " scores" : "s score"} it under 40% here, which is where it loses them.` : "No buyer scores it under 40% here."}</p>
      <h4>Every buyer's score</h4>
      ${buyerRows(r, rows, { color: colorFor(r, id), note: (c) => `picked ${esc(choiceName(r, c.purchase))}` })}`;
    openDrawer(shell(`${b.brand}: ${label.toLowerCase()}`, `${esc(label)}: ${pct(b.funnel[stage])}`, body));
  }

  // A segment cell: the buyers in that segment and everything each of them weighed.
  function investigateSegment(r, si, id) {
    const seg = r.segments[si];
    if (seg == null) return;
    const members = r.customers.filter((c) => c.segment === seg);
    const none = id === "none";
    const b = none ? null : r.brands.find((x) => x.id === id);
    const v = none ? r.noPurchase.bySegment[seg] : b?.bySegment[seg];
    const name = none ? "buying nothing" : `picking ${esc(b?.brand)}`;
    const body = `
      <p class="drawer-lede">${pct(v ?? 0)} is the average chance of ${name} among the ${members.length} ${esc(seg)} buyers.
        With ${members.length} buyers, treat this as a direction rather than a measurement.</p>
      <h4>The buyers in this segment</h4>
      ${members.map((c) => `
        <div class="dbuyer">
          <div class="dbuyer-top">${buyerFace(c, si, 32)}<b>${esc(c.name)}</b><span class="dbuyer-seg">Picked ${esc(choiceName(r, c.purchase))}</span>
            <span class="dbuyer-rate">${pct(c.purchaseProbs[id] ?? 0)}</span></div>
          <p class="dbuyer-prof">${esc(c.profile)}</p>
          ${alternatives(r, c)}
        </div>`).join("")}`;
    openDrawer(shell(seg, `${esc(seg)}: ${pct(v ?? 0)} ${none ? "bought nothing" : `for ${esc(b?.brand)}`}`, body));
  }

  // One part of one ad: how often buyers named it as what most made them want the
  // product, how often as what most put them off, who, and how that splits by segment.
  function investigatePart(r, id, key) {
    const b = r.brands.find((x) => x.id === id);
    const part = b?.parts?.find((p) => p.key === key);
    if (!part) return;
    const n = panelOf(r);
    const named = (k) => r.customers.filter((c) => c.byBrand[id]?.[k] === key);
    const pullers = named("pull"), pushers = named("push");
    const w = workOf(b);
    const pushClear = w?.push?.key === key;
    const color = colorFor(r, id);
    const partRow = (p) => `
      <button class="prow${p.key === key ? " on" : ""}" type="button" data-investigate="part:${id}:${p.key}">
        <span class="prow-t"><span class="prow-l">${esc(p.label)}</span>${esc(quoteOf(p.text, 80))}</span>
        <span class="prow-v"><i class="k-hl"></i>${pct(b.pull[p.key] ?? 0)}</span>
        <span class="prow-v"><i class="k-wave"></i>${pct(b.push[p.key] ?? 0)}</span>
      </button>`;
    const body = `
      <p class="drawer-lede">Each buyer named the one part of ${esc(b.brand)}'s ad that most made them want it, and the one that most put them off.
        ${(b.push[key] ?? 0) > (b.pull[key] ?? 0)
          ? `${pushers.length} of ${n} named this part as what most put them off (${pct(b.push[key] ?? 0)} on average); ${pullers.length} named it as what most made them want it (${pct(b.pull[key] ?? 0)}).`
          : `${pullers.length} of ${n} named this part as what most made them want it (${pct(b.pull[key] ?? 0)} on average); ${pushers.length} named it as what most put them off (${pct(b.push[key] ?? 0)}).`}
        ${pushClear ? "That is a clear finding: fix this before anything else." : (b.push[key] ?? 0) >= 0.15 ? "No single part clearly stands out as off-putting in this ad, so treat that as a hint rather than a finding." : ""}</p>
      <h4>Every part of this ad</h4>
      <div class="prows"><div class="prow prow-h"><span></span><span>Convinced</span><span>Put off</span></div>${b.parts.map(partRow).join("")}
        <div class="prow prow-none"><span class="prow-t">Nothing put them off</span><span></span><span class="prow-v">${pct(b.push.none ?? 0)}</span></div></div>
      ${[[pushClear || (b.push[key] ?? 0) > (b.pull[key] ?? 0) ? pushers : pullers, pushClear || (b.push[key] ?? 0) > (b.pull[key] ?? 0) ? "Buyers it put off most" : "Buyers it convinced most"],
         [pushClear || (b.push[key] ?? 0) > (b.pull[key] ?? 0) ? pullers : pushers, pushClear || (b.push[key] ?? 0) > (b.pull[key] ?? 0) ? "Buyers it convinced most" : "Buyers it put off most"]]
        .filter(([list]) => list.length).map(([list, h]) => `<h4>${h}</h4>${buyerRows(r, list.map((c) => ({ c, v: c.purchaseProbs[id] ?? 0 })), { color, note: (c) => `picked ${esc(choiceName(r, c.purchase))}` })}`).join("")}
      ${pullers.length || pushers.length ? `<p class="drawer-note">Bars show each buyer's chance of picking ${esc(b.brand)}.</p>` : ""}
      ${b.pullBySegment ? `<h4>Convinced, by segment</h4>
        <div class="dalt">${r.segments.map((s) => `
          <div class="dalt-row" style="--c:#E9B949"><span>${esc(s)}</span><span class="t"><i style="width:${pct(b.pullBySegment[s]?.[key] ?? 0)}"></i></span><span class="p">${pct(b.pullBySegment[s]?.[key] ?? 0)}</span></div>`).join("")}</div>` : ""}
      <p class="drawer-note">The buyers read the ad's exact words. They can't see layout, type size or images, so this says which words did the work, not what caught the eye.</p>`;
    openDrawer(shell(`${b.brand}: what did the work`, esc(quoteOf(part.text, 90)), body));
  }

  function showDefinition(key) {
    const [title, text] = DEFS[key] || ["", ""];
    openDrawer(shell("Definition", esc(title), `<p>${esc(text)}</p>`));
  }

  // Every number in the report is a claim with evidence behind it. They all go
  // through one listener, so a new call site needs only a data-investigate attribute:
  //   share:ID  obj:KEY:ID  stage:STAGE:ID  seg:INDEX:ID  buyer:ID  part:ID:KEY
  function investigate(spec, from) {
    if (!current) return;
    const [kind, a, b] = spec.split(":");
    if (kind === "obj") return investigateObjection(current, a, b);
    if (kind === "share") return investigateShare(current, a);
    if (kind === "stage") return investigateStage(current, a, b);
    if (kind === "seg") return investigateSegment(current, +a, b);
    // The face to lift, when the buyer was opened from a seat or a row that shows one.
    if (kind === "buyer") return investigateBuyer(current, a, from?.matches?.(".seat, .erow") ? from.querySelector(".buyerface") : null);
    if (kind === "part") return investigatePart(current, a, b);
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest(".drawer-x")) return closeDrawer();
    if (e.target.closest(".drawer-back")) return drawerBack();
    const def = e.target.closest("[data-def]");
    if (def) return showDefinition(def.dataset.def);
    const probe = e.target.closest("[data-investigate]");
    if (probe) return investigate(probe.dataset.investigate, probe);
  });
  // Cells and bars that are not buttons still answer to the keyboard.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const probe = e.target.closest?.("[data-investigate]");
    if (!probe || probe.tagName === "BUTTON") return;
    e.preventDefault();
    investigate(probe.dataset.investigate);
  });

  // index: omit to show the latest round, or pass one to view an earlier round.
  function renderResults(rounds, animate, index) {
    viewIndex = index == null ? null : index;
    if (animate) activeTab = "overview";
    const idx = indexFor(rounds);
    const r = rounds[idx];
    current = r;
    const prev = idx > 0 ? rounds[idx - 1] : null;
    const latest = idx === rounds.length - 1;

    $("#results").classList.remove("hidden");
    if (has("#ghost")) $("#ghost").classList.add("hidden");
    if (has("#reportBar")) $("#reportBar").classList.remove("hidden");
    ["#csv", "#pdf", "#share"].forEach((id) => { if (has(id)) $(id).disabled = false; });
    $("#marketTitle").textContent = `Round ${idx + 1}: the market decided`;
    $("#roundNote").textContent = latest ? "" : `Viewing an earlier round. Round ${rounds.length} is the latest.`;

    const col = (id) => r.slots[r.brands.findIndex((b) => b.id === id)];
    const color = (id) => id === "none" ? NONE_COLOR : COLORS[col(id)];
    const nameOf = (id) => id === "none" ? "nothing" : r.brands.find((b) => b.id === id).brand;

    renderRoundTabs(rounds, idx);

    $("#flags").innerHTML = r.brands.filter((b) => b.flagged).map((b) =>
      `<p class="flag"><b>${esc(b.brand)}</b>'s ad reads like it's talking to the judges, not to buyers. Rewrite it as real marketing copy.</p>`).join("");

    const parts = [...r.brands.map((b, i) => ({ id: b.id, share: b.share, c: COLORS[r.slots[i]], ink: INK_ON[r.slots[i]] })),
                   { id: "none", share: r.noPurchase.share }];
    // The "bought nothing" slice says so in words where it has room, so it doesn't
    // read as a fourth product sitting next to the real ones.
    const barLabel = (p) => p.id !== "none" ? (p.share >= .07 ? pct(p.share) : "")
      : (p.share >= .16 ? `${pct(p.share)} bought nothing` : p.share >= .07 ? pct(p.share) : "");
    $("#sharebar").innerHTML = parts.map((p) =>
      `<div class="${p.id === "none" ? "none" : ""}" data-investigate="share:${p.id}" role="button" tabindex="0" aria-label="${p.id === "none" ? "Bought nothing" : esc(r.brands.find((b) => b.id === p.id).brand)}, ${pct(p.share)}" style="flex-grow:${animate ? 0.0001 : p.share};${p.c ? `background:${p.c};color:${p.ink ? "var(--ink)" : "#fff"}` : ""}">${barLabel(p)}</div>`).join("");
    if (animate) requestAnimationFrame(() => requestAnimationFrame(() =>
      [...$("#sharebar").children].forEach((el, i) => el.style.flexGrow = parts[i].share)));

    $("#legend").innerHTML = r.brands.map((b, i) => `
      <div class="probe" data-investigate="share:${b.id}" role="button" tabindex="0"><span class="sw" style="background:${COLORS[r.slots[i]]}"></span><span>${esc(b.brand)}</span>
      <span class="pct num">${pct(b.share)}</span><span class="picks num">${picksFor(r, b.id)} of ${panelOf(r)}</span>${deltaChip(b.share, prev ? bySlot(prev, r.slots[i])?.share : null)}</div>`).join("") +
      `<div class="none-entry probe" data-investigate="share:none" role="button" tabindex="0"><span class="sw" style="background:repeating-linear-gradient(135deg,#B9B9B4 0 3px,#DADAD6 3px 6px)"></span><span>Bought nothing</span><span class="pct num">${pct(r.noPurchase.share)}</span><span class="picks num">${picksFor(r, "none")} of ${panelOf(r)}</span></div>`;

    // Both numbers above are real and they disagree on purpose. Saying so here is
    // cheaper than letting a reader decide the report is broken.
    $("#numNote").innerHTML = `The percentage is <b>average choice probability</b> — across all ${panelOf(r)} buyers, how likely each was to pick that version. The count is <b>outright picks</b>: buyers whose top choice it was. They differ because a buyer leaning 40/35/25 contributes to all three percentages but is counted only once.`;

    renderHero(r, prev, idx, rounds.length, animate);
    renderExplain(r, prev);
    renderPitches(r);

    $("#segments").innerHTML = r.segments.map((s) => `
      <div class="seg"><h3>${esc(s)}</h3><div class="people">
        ${r.customers.filter((c) => c.segment === s).map((c, k) => {
          const undecided = isTossup(c);
          // A card with the decision on the front and the person on the back: turning
          // it over is how you get to know who a buyer is, and the back leads on to
          // how they scored every version.
          return `<div class="person" data-p="${c.id}">
            <button class="pc-face pc-front" type="button" aria-expanded="false" aria-label="${esc(c.name)}, bought ${esc(nameOf(c.purchase))}. Turn over to see who they are">
              <span class="token" style="--tc:${animate ? "#C9C9C4" : color(c.purchase)};--d:${k * 120 + r.segments.indexOf(s) * 60}ms" data-final="${color(c.purchase)}">${buyerFace(c, r.segments.indexOf(s), 44, { tint: "currentColor", dashed: undecided })}</span>
              <span><span class="pname">${esc(c.name)}</span>${undecided ? `<span class="tag">Too close to call</span>` : ""}
              <span class="pchoice" style="display:block">Bought ${esc(nameOf(c.purchase))}</span>
              <span class="conf" aria-label="Confidence ${pct(c.confidence)}"><i style="width:${pct(c.confidence)}"></i></span></span>
              <span class="pc-turn" aria-hidden="true">${ICON.turn}</span>
            </button>
            <div class="pc-face pc-back" inert>
              <p class="pc-prof"><b>${esc(c.name)}.</b> ${esc(c.profile)}</p>
              <div class="pc-acts">
                <button type="button" class="pc-go" data-investigate="buyer:${c.id}">How they scored each version ${ICON.arrow}</button>
                <button type="button" class="pc-flip" aria-label="Turn ${esc(c.name)}'s card back over">${ICON.turn}</button>
              </div>
            </div>
          </div>`;
        }).join("")}</div></div>`).join("");
    if (animate) requestAnimationFrame(() => requestAnimationFrame(() =>
      document.querySelectorAll(".token").forEach((t) => t.style.setProperty("--tc", t.dataset.final))));

    $("#funnels").innerHTML = r.brands.map((b, i) => {
      const { worst, gap } = biggestDrop(b);
      return `<div class="funnel" style="--c:${COLORS[r.slots[i]]}"><h3><span class="sw" style="background:var(--c)"></span>${esc(b.brand)}</h3>
        ${STAGES.map(([k, lab]) => `<div class="frow probe" data-investigate="stage:${k}:${b.id}" role="button" tabindex="0"><span class="flab">${stageIcon(k)}${lab}</span><span class="track"><i style="width:${pct(b.funnel[k])}"></i></span><span class="num">${pct(b.funnel[k])}</span></div>`).join("")}
        <p class="drop">Biggest drop is from ${STAGES[worst - 1][1].toLowerCase()} to ${STAGES[worst][1].toLowerCase()}, ${Math.round(gap * 100)} points.</p></div>`;
    }).join("");

    // Fill is capped at 50% so ink text stays readable on every version colour; white
    // text on a half-strength fill was the old failure (2-3:1 on teal).
    const heat = (v, c) => `background:color-mix(in srgb, ${c} ${Math.round(v * HEAT_MAX.seg)}%, var(--paper))`;
    $("#heatKey").innerHTML = heatKey("share", "share of that segment");
    $("#heat").innerHTML = `<thead><tr><th scope="col">Segment</th>${r.brands.map((b) => `<th scope="col">${esc(b.brand)}</th>`).join("")}<th scope="col">Bought nothing</th></tr></thead><tbody>` +
      r.segments.map((s, si) => `<tr><th scope="row">${esc(s)}</th>${r.brands.map((b, i) => `<td class="cell num probe" data-investigate="seg:${si}:${b.id}" role="button" tabindex="0" title="See these buyers" style="${heat(b.bySegment[s], HEX[r.slots[i]])}">${pct(b.bySegment[s])}</td>`).join("")}<td class="cell num probe" data-investigate="seg:${si}:none" role="button" tabindex="0" title="See these buyers" style="${heat(r.noPurchase.bySegment[s], "#8E8E95")}">${pct(r.noPurchase.bySegment[s])}</td></tr>`).join("") + "</tbody>";

    const brandIds = r.brands.map((b) => b.id);
    $("#segInsights").innerHTML = `<ul class="seginsights">` + r.segments.map((s) => {
      const segCustomers = r.customers.filter((c) => c.segment === s);
      const counts = {};
      segCustomers.forEach((c) => brandIds.forEach((id) => { const o = c.byBrand[id].objection; if (o !== "none") counts[o] = (counts[o] || 0) + 1; }));
      const top = Object.entries(counts).sort((a, b2) => b2[1] - a[1])[0];
      return top ? `<li><b>${esc(s)}</b> buyers are mostly held back by ${objectionIcon(top[0])} ${OBJ_NOUN[top[0]]}.</li>` : "";
    }).join("") + `</ul>`;

    const objHeat = (v) => `background:color-mix(in srgb, var(--ink) ${Math.round(v * HEAT_MAX.obj)}%, var(--paper))`;
    $("#objections").innerHTML = `<div class="tablewrap"><table class="heat"><thead><tr><th scope="col">Objection</th>${r.brands.map((b) => `<th scope="col">${esc(b.brand)}</th>`).join("")}</tr></thead><tbody>` +
      OBJ_ORDER.map((k) => `<tr><th scope="row">${objectionIcon(k)} ${cap(OBJ_LABEL[k])}</th>${r.brands.map((b) => `<td class="cell num probe" style="${objHeat(b.objections[k])}" data-investigate="obj:${k}:${b.id}" role="button" tabindex="0" title="See the buyers behind this number">${pct(b.objections[k])}</td>`).join("")}</tr>`).join("") +
      `</tbody></table></div>` + heatKey("obj", "share of buyers citing it") +
      r.brands.map((b) => {
        const [topK, topV] = topObjection(b);
        return `<p class="objsum"><b>${esc(b.brand)}</b>'s top blocker: ${objectionIcon(topK)} <button class="numlink" type="button" data-investigate="obj:${topK}:${b.id}">${pct(topV)}</button> cite ${OBJ_NOUN[topK]}.</p>`;
      }).join("");

    renderContext(r);
    renderSuggestions(r);
    renderChanges(r, prev);
    renderDeltas(r, prev);
    showDetail();
    renderHistory(rounds, idx);
    numberSections();
    $("#meta").textContent = `${r.model}, ${r.tokens.toLocaleString()} tokens, ${(r.ms / 1000).toFixed(1)}s`;
  }

  // What public research told the buyers, next to what the buyers then did with it.
  // The two columns are different measures and the section says so: research counts
  // how strongly a concern shows up in public sources, the panel counts how often it
  // was a buyer's main reason. Agreement is a sanity check on the simulation, and a
  // gap is worth a look, but neither is a score.
  function renderContext(r) {
    if (!has("#contextSec")) return;
    const items = r.context?.items || [];
    $("#contextSec").classList.toggle("hidden", !items.length);
    if (!items.length) { $("#context").innerHTML = ""; return; }
    const barriers = items.filter((i) => i.objection !== "none");
    const pulls = items.filter((i) => i.objection === "none");
    const wTotal = barriers.reduce((s2, i) => s2 + (i.weight || 0), 0) || 1;
    const research = Object.fromEntries(OBJ_ORDER.map((k) => [k, barriers.filter((i) => i.objection === k).reduce((s2, i) => s2 + (i.weight || 0), 0) / wTotal]));
    const panelRaw = Object.fromEntries(OBJ_ORDER.map((k) => [k, r.brands.reduce((s2, b) => s2 + (b.objections[k] || 0), 0) / r.brands.length]));
    const pTotal = OBJ_ORDER.reduce((s2, k) => s2 + panelRaw[k], 0) || 1;
    const panel = Object.fromEntries(OBJ_ORDER.map((k) => [k, panelRaw[k] / pTotal]));
    const when = r.context.researchedAt ? new Date(r.context.researchedAt) : null;
    const line = (i) => `<li>${i.objection !== "none" ? objectionIcon(i.objection) : `<span class="ctx-pull" aria-hidden="true">+</span>`}<span>${esc(i.text)}</span></li>`;
    $("#context").innerHTML = `
      <p class="ctx-meta">Researched ${when && !isNaN(when) ? when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""}${r.context.topic ? ` for “${esc(r.context.topic)}”` : ""}. Every buyer read these lines before seeing the ads, and every round in this project uses the same ones.</p>
      <div class="ctx-cols">
        <div><h3 class="ctx-h">What holds buyers back</h3><ul class="ctx-list">${barriers.map(line).join("") || `<li class="muted">The research found no clear barriers.</li>`}</ul></div>
        <div><h3 class="ctx-h">What pulls them in</h3><ul class="ctx-list">${pulls.map(line).join("") || `<li class="muted">The research found no clear pull.</li>`}</ul></div>
      </div>
      ${barriers.length ? `<h3 class="ctx-h" style="margin-top:22px">Research against your buyers</h3>
      <div class="ctx-compare" role="table" aria-label="Objection mix: research versus buyers">
        <div class="ctx-row ctx-headrow" role="row"><span role="columnheader">Objection</span><span role="columnheader">In the research</span><span role="columnheader">Your buyers' main reason</span></div>
        ${OBJ_ORDER.map((k) => `<div class="ctx-row" role="row"><span role="cell">${objectionIcon(k)} ${cap(OBJ_LABEL[k])}</span>
          <span role="cell" class="ctx-bar"><i style="width:${pct(research[k])}"></i><b class="num">${pct(research[k])}</b></span>
          <span role="cell" class="ctx-bar panel"><i style="width:${pct(panel[k])}"></i><b class="num">${pct(panel[k])}</b></span></div>`).join("")}
      </div>
      <p class="ctx-note">Both columns are shares of the four objections, so each sums to 100%. They measure different things — how strongly a concern shows up in public sources, and how often it was a buyer's main reason not to buy — so read a big gap as something to check, not as an error.</p>` : ""}`;
  }

  const listWords = (xs) => xs.length < 2 ? (xs[0] || "") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];

  // Every sentence here is assembled from this round's own numbers — no model
  // writes it, so it can't say anything the data doesn't. Causal wording stays
  // hedged ("after you changed"), because a round shows correlation at best.
  function renderExplain(r, prev) {
    const ranked = [...r.brands].sort((a, b) => b.share - a.share);
    const win = ranked[0], second = ranked[1];
    const gapPts = Math.round((win.share - second.share) * 100);
    const n = r.customers.length;
    const lines = [];

    const winPicks = picksFor(r, win.id), secondPicks = picksFor(r, second.id);
    if (gapPts < 5)
      lines.push(`<b>${esc(win.brand)}</b> and <b>${esc(second.brand)}</b> finished level — ${pct(win.share)} against ${pct(second.share)}, picked outright by ${winPicks} and ${secondPicks} of ${n} buyers. A gap that small isn't a result you can act on; treat it as a tie.`);
    else
      lines.push(`<b>${esc(win.brand)}</b> won this round on ${pct(win.share)} average choice probability, ${gapPts} points clear of ${esc(second.brand)} on ${pct(second.share)}. ${winPicks} of ${n} buyers picked it outright.`);

    // The two statistics can disagree sharply here — a panel can carry real probability
    // of walking away while nobody actually walks — so say which one is being quoted.
    const nonePicks = picksFor(r, "none");
    if (nonePicks > 0)
      lines.push(`${nonePicks} of ${n} buyers bought nothing at all.`);
    else if (r.noPurchase.share >= .05)
      lines.push(`No buyer walked away outright, but the panel still carried ${pct(r.noPurchase.share)} average probability of buying nothing — the doubt is there even where it didn't decide anyone.`);

    const tossups = r.customers.filter(isTossup).length;
    if (tossups)
      lines.push(`${tossups} of ${n} buyer${tossups === 1 ? " was" : "s were"} close to a coin flip between their top two choices. Those are the picks most likely to land differently on an identical re-run.`);

    // The final stage is the share itself, so comparing it would just restate the
    // first line; the useful question is where upstream the two separated.
    const edge = STAGES.filter(([k]) => k !== "purchase").map(([k]) => [k, win.funnel[k] - second.funnel[k]]).sort((a, b) => b[1] - a[1])[0];
    if (edge[1] > .03)
      lines.push(`<b>${esc(win.brand)}</b>'s clearest advantage was in ${STAGE_PLAIN[edge[0]]}: ${pct(win.funnel[edge[0]])} against ${esc(second.brand)}'s ${pct(second.funnel[edge[0]])}.`);

    const worstObj = OBJ_ORDER.map((k) => [k, r.brands.reduce((s, b) => s + b.objections[k], 0) / r.brands.length]).sort((a, b) => b[1] - a[1])[0];
    lines.push(`The most common objection across every version was that ${OBJ_CLAUSE[worstObj[0]]} (${pct(worstObj[1])} on average).`);

    const dissent = r.segments.map((s) => {
      const best = [...r.brands].sort((a, b) => b.bySegment[s] - a.bySegment[s])[0];
      return best.id === win.id ? null : { s, best };
    }).filter(Boolean)[0];
    if (dissent)
      lines.push(`Not everyone agreed: <b>${esc(dissent.s)}</b> buyers went for ${esc(dissent.best.brand)} instead, on ${pct(dissent.best.bySegment[dissent.s])} of that segment.`);

    if (prev) {
      const move = r.brands.map((b, i) => {
        const before = bySlot(prev, r.slots[i]);
        if (!before) return null;
        const d = Math.round((b.share - before.share) * 100);
        if (Math.abs(d) < 5) return null;
        return { b, d, changed: diffFields(r).filter(([f]) => (fieldValue(before, f) || "") !== (fieldValue(b, f) || "")).map(([, label]) => label.toLowerCase()) };
      }).filter(Boolean).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
      if (move)
        lines.push(`<b>${esc(move.b.brand)}</b> ${move.d > 0 ? "gained" : "lost"} ${Math.abs(move.d)} points since the last round, ${move.changed.length ? `after you changed its ${listWords(move.changed)}` : "with no change to its own copy"}.`);
    }

    $("#explain").innerHTML = `<p class="explain-label">What happened</p>` + lines.map((l) => `<p>${l}</p>`).join("");
  }

  // One shared key for both heatmaps, built with the same colour-mix the cells use.
  function heatKey(kind, note) {
    const swatch = (v) => `background:color-mix(in srgb, var(--ink) ${Math.round(v * HEAT_MAX[kind === "obj" ? "obj" : "seg"])}%, var(--paper))`;
    return `<div class="heatkey"><span class="num">0%</span>${[0, .25, .5, .75, 1].map((v) => `<i style="${swatch(v)}"></i>`).join("")}<span class="num">100%</span><span class="hk-note">${note}</span></div>`;
  }

  function biggestDrop(b) {
    const vals = STAGES.map(([k]) => b.funnel[k]);
    let worst = 1, gap = -1;
    for (let j = 1; j < vals.length; j++) if (vals[j - 1] - vals[j] > gap) { gap = vals[j - 1] - vals[j]; worst = j; }
    return { worst, gap };
  }
  const topObjection = (b) => Object.entries(b.objections).filter(([k]) => k !== "none").sort((a, c) => c[1] - a[1])[0];

  // The ads themselves, so the report says what produced the numbers, shown in the
  // format the team will ship them in. Switching format here never changes a number.
  let pitchRound = null;
  function renderPitches(r) {
    pitchRound = r;
    $("#pitchSec").classList.remove("hidden");
    // This report's own pick, else the project's, else what the round was run in.
    const fmt = formatOf(format || getFormat?.() || r.format);
    let tools = $("#pitchFmt");
    if (!tools) {
      $("#pitches").insertAdjacentHTML("beforebegin", `<div class="fmt-tools" id="pitchFmt"></div>`);
      tools = $("#pitchFmt");
    }
    const hasWork = r.brands.some((b) => workOf(b));
    tools.innerHTML = `${formatSwitch(fmt, "report")}
      ${hasWork ? `<button type="button" class="work-toggle" aria-pressed="${showWork}" data-work-toggle>What did the work</button>
        <span class="work-key${showWork ? "" : " hidden"}"><span><i class="k-hl"></i>convinced buyers</span><span><i class="k-wave"></i>put them off</span></span>` : ""}
      <span class="fmt-note">Buyers read the same words in every format.</span>`;
    const maxShare = Math.max(...r.brands.map((b) => b.share));
    $("#pitches").className = `pitches ads fmt-${fmt}${showWork ? " show-work" : ""}`;
    $("#pitches").innerHTML = r.brands.map((b, i) => {
      const w = showWork ? workOf(b) : null;
      const marks = w ? { id: b.id, parts: {
        ...(w.second ? { [w.second.key]: { pull: 2, title: `Convinced ${pct(w.second.v)} of buyers` } } : {}),
        ...(w.top ? { [w.top.key]: { pull: 1, title: `Convinced ${pct(w.top.v)} of buyers` } } : {}),
      } } : null;
      if (w?.push) marks.parts[w.push.key] = { ...(marks.parts[w.push.key] || {}), push: true, title: `Put off ${pct(w.push.v)} of buyers` };
      return `
      <figure class="adf${b.share === maxShare ? " lead" : ""}" style="--c:${COLORS[r.slots[i]]}">
        ${adMock(b, fmt, { marks })}
        <figcaption class="adf-meta"><span class="sw" style="background:var(--c)"></span><b>${esc(b.brand)}</b>${b.share === maxShare ? `<span class="pitch-lead">Leading</span>` : ""}
          <button class="pitch-share num numlink" type="button" data-investigate="share:${b.id}" aria-label="${esc(b.brand)}, ${pct(b.share)}. See the buyers">${pct(b.share)}</button></figcaption>
        ${w ? `<div class="adf-why">
          ${w.top ? `<button type="button" class="why" data-investigate="part:${b.id}:${w.top.key}"><i class="k-hl"></i><span class="why-t">${esc(quoteOf(w.top.text))}</span><b>${pct(w.top.v)}</b></button>`
                  : `<span class="why why-none">No single part stood out as the reason to buy</span>`}
          ${w.push ? `<button type="button" class="why" data-investigate="part:${b.id}:${w.push.key}"><i class="k-wave"></i><span class="why-t">${esc(w.push.label.toLowerCase().startsWith("line") ? quoteOf(w.push.text) : w.push.label.replace(/^The /, "the "))}</span><b>${pct(w.push.v)}</b></button>`
                   : `<span class="why why-none">Nothing stood out as off-putting</span>`}
        </div>` : ""}
      </figure>`;
    }).join("");
  }
  let showWork = true;
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-work-toggle]") || !pitchRound) return;
    showWork = !showWork;
    renderPitches(pitchRound);
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest('[data-fmt-for="report"]');
    if (!b || !pitchRound) return;
    format = b.dataset.fmt;
    renderPitches(pitchRound);
    onFormat?.(format);
  });

  function renderSuggestions(r) {
    $("#suggestSec").classList.remove("hidden");
    const maxShare = Math.max(...r.brands.map((b) => b.share));
    $("#suggestions").innerHTML = r.brands.map((b, i) => {
      const { worst, gap } = biggestDrop(b);
      const dropFrom = STAGES[worst - 1][1].toLowerCase(), dropTo = STAGES[worst][1].toLowerCase();
      const [topK, topV] = topObjection(b);
      const body = b.share === maxShare
        ? `Leading the round at ${pct(b.share)}, but ${pct(topV)} of buyers still cite ${OBJ_NOUN[topK]}. Worth testing a fix before it costs share.`
        : `It loses the most people between ${dropFrom} and ${dropTo} (${Math.round(gap * 100)} points), and the top objection is ${OBJ_NOUN[topK]} (${pct(topV)}). Try testing ${OBJ_FIX[topK]} next round.`;
      return `<div class="suggest" style="--c:${COLORS[r.slots[i]]}"><h3><span class="sw" style="background:var(--c)"></span>${esc(b.brand)}</h3><p>${body}</p></div>`;
    }).join("");
  }

  // What you actually rewrote between the previous round and this one — the other
  // half of the share delta, so a move in the numbers has a visible cause.
  function renderChanges(r, prev) {
    if (!prev) { $("#changesSec").classList.add("hidden"); return; }
    const blocks = r.brands.map((b, i) => {
      const before = bySlot(prev, r.slots[i]);
      if (!before) return `<div class="change new" style="--c:${COLORS[r.slots[i]]}"><h3><span class="sw" style="background:var(--c)"></span>${esc(b.brand)}</h3><p class="change-none">New this round.</p></div>`;
      const rows = diffFields(r).filter(([f]) => (fieldValue(before, f) || "") !== (fieldValue(b, f) || "")).map(([f, label]) => `
        <div class="change-row"><span class="cf">${label}</span>
          <span class="cwas">${esc(fieldValue(before, f) || "—")}</span>
          <span class="carrow">→</span>
          <span class="cnow">${esc(fieldValue(b, f) || "—")}</span></div>`).join("");
      if (!rows) return "";
      return `<div class="change" style="--c:${COLORS[r.slots[i]]}"><h3><span class="sw" style="background:var(--c)"></span>${esc(b.brand)}</h3>${rows}</div>`;
    }).filter(Boolean);
    $("#changesSec").classList.toggle("hidden", !blocks.length);
    $("#changes").innerHTML = blocks.join("");
  }

  function renderDeltas(curr, prev) {
    if (!prev) { $("#deltaSec").classList.add("hidden"); return; }
    const choiceLabel = (round, id) => { if (id === "none") return "nothing"; const b = round.brands.find((x) => x.id === id); return b ? b.brand : id; };
    const choiceSlot = (round, id) => { if (id === "none") return -1; const i = round.brands.findIndex((x) => x.id === id); return i < 0 ? -1 : round.slots[i]; };
    const prevById = Object.fromEntries(prev.customers.map((c) => [c.id, c]));
    const switched = curr.customers.map((c) => {
      const before = prevById[c.id];
      if (!before) return null;
      if (choiceSlot(prev, before.purchase) === choiceSlot(curr, c.purchase)) return null;
      return { c, from: choiceLabel(prev, before.purchase), to: choiceLabel(curr, c.purchase), appeal: c.purchase === "none" ? null : c.byBrand[c.purchase]?.appeal };
    }).filter(Boolean);
    $("#deltaSec").classList.toggle("hidden", !switched.length);
    if (!switched.length) return;
    $("#deltas").innerHTML = switched.map(({ c, from, to, appeal }) => `
      <div class="deltarow probe" data-investigate="buyer:${c.id}" role="button" tabindex="0">${buyerFace(c, curr.segments.indexOf(c.segment), 32)}<span class="dname">${esc(c.name)}</span>
        <span class="dmove"><span class="dfrom">${esc(from)}</span><span class="darrow">→</span><span class="dto">${esc(to)}</span></span>
        ${appeal != null ? `<span class="dappeal num">${pct(appeal)} appeal</span>` : ""}
      </div>`).join("");
  }

  function renderRoundTabs(rounds, idx) {
    const tabs = $("#roundTabs");
    if (!tabs) return;
    tabs.classList.remove("hidden");
    if (rounds.length < 2) { tabs.innerHTML = `<span class="round-static">Round 1</span>`; return; }
    tabs.innerHTML = `<button class="round-btn" type="button" aria-label="Round ${idx + 1} of ${rounds.length}. Choose a round">
      <span>Round <b>${idx + 1}</b><span class="rb-of"> of ${rounds.length}</span></span>${ICON.chevron}</button>`;
    menuButton(tabs.querySelector(".round-btn"), () => [
      { heading: "Rounds" },
      ...rounds.map((r, i) => ({
        label: `Round ${i + 1}`,
        meta: i === rounds.length - 1 ? "Latest" : "",
        checked: i === idx,
        onSelect: () => { open = null; renderResults(getRounds(), false, i === rounds.length - 1 ? null : i); },
      })),
    ], { label: "Rounds" });
  }

  function renderHistory(rounds, idx) {
    const R = rounds;
    $("#historySec").classList.toggle("hidden", R.length < 2);
    if (R.length < 2) return;
    const W = 760, H = 260, P = { l: 44, r: 120, t: 14, b: 30 };
    const x = (i) => P.l + (i * (W - P.l - P.r)) / (R.length - 1);
    const max = Math.max(.5, ...R.flatMap((r) => r.brands.map((b) => b.share)));
    const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
    const slots = [...new Set(R.flatMap((r) => r.slots))];
    let svg = `<svg class="history" viewBox="0 0 ${W} ${H}" width="100%" style="min-width:520px;max-width:860px;display:block" role="img" aria-label="Market share by round">`;
    [0, .25, .5, .75, 1].filter((v) => v <= max).forEach((v) => svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#E5E5E1"/><text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end">${pct(v)}</text>`);
    if (idx != null) svg += `<line x1="${x(idx)}" x2="${x(idx)}" y1="${P.t}" y2="${H - P.b}" stroke="#1C1C1F" stroke-width="1.5" stroke-dasharray="4 4"/>`;
    R.forEach((_, i) => svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" style="${i === idx ? "font-weight:600;fill:#1C1C1F" : ""}">R${i + 1}</text>`);
    slots.forEach((s) => {
      const pts = R.map((r, i) => { const k = r.slots.indexOf(s); return k < 0 ? null : [x(i), y(r.brands[k].share), r.brands[k].brand]; });
      const segs = pts.filter(Boolean);
      svg += `<polyline fill="none" stroke="${HEX[s]}" stroke-width="3" points="${segs.map((p) => p[0] + "," + p[1]).join(" ")}"/>`;
      segs.forEach((p) => svg += `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="${HEX[s]}"/>`);
      const last = segs[segs.length - 1];
      if (last) svg += `<text x="${last[0] + 10}" y="${last[1] + 4}" style="fill:${HEX[s]};font-weight:600">${esc(last[2])}</text>`;
    });
    $("#history").innerHTML = svg + "</svg>";
  }

  /* ---- Tabs ------------------------------------------------------------------
     The report is an Overview that answers the question, and detail tabs that hold
     the evidence. Every section stays in the one document and tabs only hide the
     others, so printing and "Download PDF" still get the whole report. A tab with
     nothing in it for this round (no research, no history yet) is not offered. */
  const TABS = [
    { key: "overview", label: "Overview", els: () => [$("#hero")?.parentElement, $("#askSec")?.parentElement] },
    { key: "market", label: "Market", ids: ["secMarket"] },
    { key: "buyers", label: "Buyers", ids: ["secBuyers", "deltaSec"] },
    { key: "versions", label: "Versions", ids: ["pitchSec", "secFunnels", "suggestSec"] },
    { key: "segments", label: "Segments", ids: ["secSegments"] },
    { key: "objections", label: "Objections", ids: ["secObjections"] },
    { key: "research", label: "Research", ids: ["contextSec"] },
    { key: "history", label: "History", ids: ["changesSec", "historySec"] },
  ];
  const TAB_KEYS = TABS.map((t) => t.key);
  let activeTab = TAB_KEYS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview";
  const panelsOf = (t) => (t.els ? t.els() : t.ids.map((id) => document.getElementById(id))).filter(Boolean);
  const tabAvailable = (t) => t.key === "overview"
    ? has("#hero") && !$("#hero").classList.contains("hidden")
    : panelsOf(t).some((el) => !el.classList.contains("hidden"));

  function renderTabs() {
    const nav = $("#reportNav");
    if (!nav) return;
    const avail = TABS.filter(tabAvailable);
    if (!avail.some((t) => t.key === activeTab)) activeTab = avail[0]?.key || "overview";
    nav.setAttribute("role", "tablist");
    nav.innerHTML = avail.map((t) => `<button class="rtab-btn" role="tab" type="button" id="tab-${t.key}" data-tab="${t.key}"
      aria-selected="${t.key === activeTab}" tabindex="${t.key === activeTab ? 0 : -1}">${t.label}</button>`).join("");
    TABS.forEach((t) => {
      let first = true;
      panelsOf(t).forEach((el) => {
        const on = t.key === activeTab;
        el.classList.toggle("tab-off", !on);
        el.setAttribute("role", "tabpanel");
        el.setAttribute("aria-labelledby", `tab-${t.key}`);
        // The first visible section in a tab needs no rule above it.
        const shows = on && !el.classList.contains("hidden");
        el.classList.toggle("first-in-tab", shows && first);
        if (shows) first = false;
      });
    });
    slideInk(nav);
  }

  // The line under the selected tab slides from the tab you left to the one you
  // chose, rather than blinking out in one place and in at another.
  let inkAt = null;
  function slideInk(nav) {
    const on = nav.querySelector('[aria-selected="true"]');
    if (!on) return;
    const ink = Object.assign(document.createElement("span"), { className: "rtab-ink" });
    ink.setAttribute("aria-hidden", "true");
    nav.classList.add("has-ink");
    nav.append(ink);
    const to = { x: on.offsetLeft, w: on.offsetWidth };
    const place = (p) => { ink.style.transform = `translateX(${p.x}px)`; ink.style.width = `${p.w}px`; };
    if (inkAt && !reducedMotion() && (inkAt.x !== to.x || inkAt.w !== to.w)) {
      place(inkAt);
      ink.getBoundingClientRect();
      ink.classList.add("moving");
    }
    place(to);
    inkAt = to;
  }

  // Tabs cross-fade: what you are leaving fades out quickly, then what you chose
  // fades up in its place. A newer choice made mid-fade wins.
  let tabSwap = 0;
  function setTab(key, { focus = false } = {}) {
    if (!TAB_KEYS.includes(key)) return;
    const leaving = key === activeTab || reducedMotion() ? [] : panelsOf(TABS.find((t) => t.key === activeTab) || TABS[0]).filter((el) => !el.classList.contains("tab-off") && !el.classList.contains("hidden"));
    const swap = ++tabSwap;
    activeTab = key;
    if (leaving.length) {
      // The selection moves at once, so the tabs answer the click immediately.
      const nav = $("#reportNav");
      nav?.querySelectorAll("[data-tab]").forEach((b) => { const on = b.dataset.tab === key; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
      if (nav) { nav.querySelector(".rtab-ink")?.remove(); slideInk(nav); }
      if (focus) document.getElementById(`tab-${key}`)?.focus();
      Promise.all(leaving.map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: "ease-in", fill: "forwards" }).finished.catch(() => {})))
        .then(() => {
          leaving.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
          if (swap === tabSwap) showTab(key, focus);
        });
      return;
    }
    showTab(key, focus);
  }
  function showTab(key, focus) {
    renderTabs();
    if (!reducedMotion()) panelsOf(TABS.find((t) => t.key === key)).filter((el) => !el.classList.contains("hidden"))
      .forEach((el) => el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.7,.3,1)" }));
    try { history.replaceState(null, "", `${location.pathname}${location.search}#${key}`); } catch {}
    // Land at the top of the report, not wherever the previous tab was scrolled to.
    const res = $("#results");
    if (res) {
      const offset = ($(".topbar")?.offsetHeight || 0) + ($("#reportBar")?.offsetHeight || 0) + 8;
      const top = res.getBoundingClientRect().top + scrollY - offset;
      if (scrollY > top) scrollTo({ top: Math.max(0, top) });
    }
    if (focus) document.getElementById(`tab-${key}`)?.focus();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("#reportNav [data-tab]");
    if (t) return setTab(t.dataset.tab);
    const go = e.target.closest("[data-tab-go]");
    if (go) setTab(go.dataset.tabGo);
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target.closest?.("#reportNav [data-tab]");
    if (!t) return;
    const all = [...document.querySelectorAll("#reportNav [data-tab]")];
    const i = all.indexOf(t);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: all.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    const target = all[(next + all.length) % all.length];
    setTab(target.dataset.tab, { focus: true });
  });

  // Kept under its old name: callers render the round, then this settles the tabs.
  function numberSections() { renderTabs(); }

  function attachHandlers(getRoundsFn) {
    getRounds = getRoundsFn;
    $("#detail").addEventListener("click", (e) => { if (e.target.id === "closeDetail") { open = null; showDetail(); } });
    $("#segments").addEventListener("click", (e) => {
      const btn = e.target.closest(".pc-front, .pc-flip"); if (!btn) return;
      turnCard(btn.closest(".person"));
    });
  }
  // Turns a buyer's card over, or back. The card grows to fit the side that is
  // showing, so a long profile never gets cut off, and only one card is over at a
  // time. The hidden side is inert, so the keyboard only reaches what can be seen.
  function turnCard(card, to) {
    if (!card) return;
    const over = to ?? !card.classList.contains("flipped");
    if (over) document.querySelectorAll(".person.flipped").forEach((c) => c !== card && turnCard(c, false));
    const front = card.querySelector(".pc-front"), back = card.querySelector(".pc-back");
    card.style.height = `${card.offsetHeight}px`;
    card.classList.toggle("flipped", over);
    front.inert = over; back.inert = !over;
    front.setAttribute("aria-expanded", String(over));
    const h = (over ? back : front).scrollHeight;
    requestAnimationFrame(() => { card.style.height = `${h}px`; });
    clearTimeout(card._t);
    card._t = setTimeout(() => { if (!over) card.style.height = ""; }, 520);
    if (card.contains(document.activeElement) || document.activeElement === document.body) (over ? back.querySelector(".pc-go") : front).focus({ preventScroll: true });
  }

  function resetOpen() { open = null; viewIndex = null; }

  // Which round is on screen, for pages that offer their own way to switch.
  const viewedIndex = () => indexFor(getRounds());
  return { renderResults, renderHistory, attachHandlers, resetOpen, showSkeleton, viewedIndex, setTab, showLive, liveDecided, liveFinish, liveSort };
}

export function exportCsv(rounds, filename) {
  // Optional fields get their own columns, and outright picks sit next to the
  // probability so a reader of the file is not left to guess which one they have.
  const xs = EXTRA_FIELDS.filter((f) => rounds.some((r) => r.brands.some((b) => b.extras && b.extras[f.key] != null)));
  const rows = [["round", "version", "headline", "value_proposition", "price", ...xs.map((f) => f.ad),
    "choice_share", "outright_picks", "panel_size", "noticed", "interested", "believed", ...rounds[0].segments.map((s) => "share_" + s)]];
  rounds.forEach((r, i) => r.brands.forEach((b) => rows.push([
    i + 1, b.brand, b.headline, b.valueProp, b.price, ...xs.map((f) => b.extras?.[f.key] ?? ""),
    b.share, b.picks ?? r.customers.filter((c) => c.purchase === b.id).length, r.panel ?? r.customers.length,
    b.funnel.attention, b.funnel.interest, b.funnel.belief, ...r.segments.map((s) => b.bySegment[s])])));
  const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}
