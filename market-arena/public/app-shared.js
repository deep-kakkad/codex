// Rendering engine shared by Facilitate, Practice and the read-only shared view.
// Every page ships the same report markup (#results, #reportBar/#roundTabs/#reportNav,
// #sharebar, #legend, #pitches, #segments, #detail, #funnels, #heat, #objections,
// #suggestions, #changes, #deltas, #history, #meta) and keeps its own `rounds`
// array; this module owns which round is on screen and only touches those ids.
import { personaIcon, objectionIcon, stageIcon, segmentTint } from "./icons.js";
import { EXTRA_FIELDS } from "./validate.js";

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

export function createResultsView() {
  let open = null;
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
    $("#csv").disabled = true; $("#pdf").disabled = true; if (has("#share")) $("#share").disabled = true;
    $("#flags").innerHTML = "";
    if (has("#hero")) $("#hero").classList.add("hidden");
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
    ["#pitchSec", "#suggestSec", "#changesSec", "#deltaSec"].forEach((s) => $(s).classList.add("hidden"));
  }


  /* ---- The result hero -------------------------------------------------------
     Everything below it is evidence for the two things stated here: what happened,
     and what to do next. Built from the same numbers the sections use, so the hero
     can never disagree with the report underneath it. */
  function renderHero(r, prev, idx, total) {
    if (!has("#hero")) return;
    const n = panelOf(r);
    const ranked = [...r.brands].sort((a, b) => b.share - a.share);
    const win = ranked[0], second = ranked[1];
    const gap = Math.round((win.share - second.share) * 100);
    const tied = gap < 5;
    const slotOf = (b) => r.slots[r.brands.findIndex((x) => x.id === b.id)];

    // The objection that costs the leader most, which is also the tile the user clicks.
    const [objKey, objVal] = Object.entries(win.objections || {})
      .filter(([k]) => k !== "none").sort((a, b) => b[1] - a[1])[0] || ["none", 0];

    const verdict = tied
      ? `${esc(win.brand)} and ${esc(second.brand)} are tied`
      : `${esc(win.brand)} leads this round`;
    const sub = tied
      ? `${pct(win.share)} against ${pct(second.share)} — inside the noise of a re-run, so this round does not separate them. ${cap(OBJ_NOUN[objKey])} is the objection to attack first.`
      : `${pct(win.share)} average choice probability, ${gap} points clear. ${cap(OBJ_NOUN[objKey])} is the objection holding it back.`;

    const bars = [...ranked.map((b) => ({ nm: b.brand, v: b.share, c: COLORS[slotOf(b)], none: false })),
                  { nm: "Bought nothing", v: r.noPurchase.share, none: true }];

    $("#hero").classList.remove("hidden");
    $("#hero").innerHTML = `
      <div class="hero-top">
        <span class="hero-round">Round ${idx + 1}${total > 1 ? ` of ${total}` : ""}</span>
        <span class="hero-meta">${n} simulated buyers · ${r.brands.length} versions</span>
      </div>
      <div class="hero-body">
        <h2 class="hero-verdict">${verdict}</h2>
        <p class="hero-sub">${sub}</p>

        <div class="hero-tiles">
          <div class="hero-tile" style="--tc:${COLORS[slotOf(win)]}">
            <span class="k">Leading version <button class="whatis" data-def="share" aria-label="What does average choice probability mean?">?</button></span>
            <span class="v">${pct(win.share)}</span>
            <span class="n">${esc(win.brand)} · picked outright by ${picksFor(r, win.id)} of ${n}</span>
          </div>
          <button class="hero-tile obj-tile" data-investigate="obj:${objKey}" style="--tc:var(--bad)">
            <span class="k">Top objection <span class="whatis" aria-hidden="true">?</span></span>
            <span class="v">${pct(objVal)}</span>
            <span class="n">${cap(OBJ_NOUN[objKey])} · against ${esc(win.brand)} — open the evidence</span>
          </button>
        </div>

        <p class="hero-barlab">Average choice probability <button class="whatis" data-def="share" aria-label="What does average choice probability mean?">?</button></p>
        <div class="hero-bars">
          ${bars.map((b) => `
            <div class="hero-bar ${b.none ? "none" : ""}" ${b.c ? `style="--c:${b.c}"` : ""}>
              <span class="nm">${esc(b.nm)}</span><span class="pc">${pct(b.v)}</span>
              <span class="track"><span class="fill" style="width:${pct(b.v)}"></span></span>
            </div>`).join("")}
        </div>

        <div class="hero-next">
          <h3>Suggested next experiment</h3>
          <p>Change <b>${esc(win.brand)}</b>'s ${esc(OBJ_LEVER[objKey] || "pitch")} and hold everything else, so the next round measures that one change and nothing else.</p>
        </div>

        <div class="hero-actions">
          <button class="hero-cta" data-prepare-round>Prepare round ${total + 1} →</button>
          <a class="hero-explore" href="#secMarket">Explore the full analysis ↓</a>
        </div>
      </div>`;
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
    lastFocus = document.activeElement;
    drawerEl.innerHTML = html;
    requestAnimationFrame(() => { scrimEl.classList.add("open"); drawerEl.classList.add("open"); });
    drawerEl.querySelector(".drawer-x")?.focus();
  }
  function closeDrawer() {
    if (!drawerEl) return;
    scrimEl.classList.remove("open"); drawerEl.classList.remove("open");
    lastFocus?.focus?.();
  }

  const shell = (kick, title, body) => `
    <div class="drawer-head">
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
          <div class="dbuyer-top"><b>${esc(c.name)}</b><span class="dbuyer-seg">${esc(c.segment)}</span>
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
        <button class="hypo-go" data-apply-hypo data-slot="${r.slots[r.brands.findIndex((x) => x.id === b.id)]}" data-field="${field}">Use this and prepare the next round →</button>
      </div>`;
    openDrawer(shell(`${b.brand} · ${OBJ_LABEL[key]}`, `Why ${esc(b.brand)} loses people`, body));
  }

  function investigateBuyer(r, id) {
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
    openDrawer(shell(`${c.segment}`, esc(c.name), body));
  }

  function showDefinition(key) {
    const [title, text] = DEFS[key] || ["", ""];
    openDrawer(shell("Definition", esc(title), `<p>${esc(text)}</p>`));
  }

  // Every investigable number goes through one listener, so new call sites only
  // need a data-investigate attribute rather than their own wiring.
  document.addEventListener("click", (e) => {
    if (e.target.closest(".drawer-x")) return closeDrawer();
    const def = e.target.closest("[data-def]");
    if (def) return showDefinition(def.dataset.def);
    const probe = e.target.closest("[data-investigate]");
    if (probe && current) {
      const [kind, a, b] = probe.dataset.investigate.split(":");
      if (kind === "obj") return investigateObjection(current, a, b);
    }
    const person = e.target.closest(".person[data-p]");
    if (person && current) return investigateBuyer(current, person.dataset.p);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const probe = e.target.closest?.(".cell.probe[data-investigate]");
    if (!probe || !current) return;
    e.preventDefault();
    const [kind, a, b] = probe.dataset.investigate.split(":");
    if (kind === "obj") investigateObjection(current, a, b);
  });

  // index: omit to show the latest round, or pass one to view an earlier round.
  function renderResults(rounds, animate, index) {
    viewIndex = index == null ? null : index;
    const idx = indexFor(rounds);
    const r = rounds[idx];
    current = r;
    const prev = idx > 0 ? rounds[idx - 1] : null;
    const latest = idx === rounds.length - 1;

    $("#results").classList.remove("hidden");
    if (has("#ghost")) $("#ghost").classList.add("hidden");
    if (has("#reportBar")) $("#reportBar").classList.remove("hidden");
    $("#csv").disabled = false; $("#pdf").disabled = false; if (has("#share")) $("#share").disabled = false;
    $("#marketTitle").textContent = `Round ${idx + 1}: the market decided`;
    $("#roundNote").textContent = latest ? "" : `Viewing an earlier round. Round ${rounds.length} is the latest.`;

    const col = (id) => r.slots[r.brands.findIndex((b) => b.id === id)];
    const color = (id) => id === "none" ? "#3A3934" : COLORS[col(id)];
    const inkOn = (id) => id !== "none" && INK_ON[col(id)];
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
      `<div class="${p.id === "none" ? "none" : ""}" style="flex-grow:${animate ? 0.0001 : p.share};${p.c ? `background:${p.c};color:${p.ink ? "var(--ink)" : "#fff"}` : ""}">${barLabel(p)}</div>`).join("");
    if (animate) requestAnimationFrame(() => requestAnimationFrame(() =>
      [...$("#sharebar").children].forEach((el, i) => el.style.flexGrow = parts[i].share)));

    $("#legend").innerHTML = r.brands.map((b, i) => `
      <div><span class="sw" style="background:${COLORS[r.slots[i]]}"></span><span>${esc(b.brand)}</span>
      <span class="pct num">${pct(b.share)}</span><span class="picks num">${picksFor(r, b.id)} of ${panelOf(r)}</span>${deltaChip(b.share, prev ? bySlot(prev, r.slots[i])?.share : null)}</div>`).join("") +
      `<div class="none-entry"><span class="sw" style="background:repeating-linear-gradient(135deg,#3A3934 0 3px,#8E8A7B 3px 6px)"></span><span>Bought nothing</span><span class="pct num">${pct(r.noPurchase.share)}</span><span class="picks num">${picksFor(r, "none")} of ${panelOf(r)}</span></div>`;

    // Both numbers above are real and they disagree on purpose. Saying so here is
    // cheaper than letting a reader decide the report is broken.
    $("#numNote").innerHTML = `The percentage is <b>average choice probability</b> — across all ${panelOf(r)} buyers, how likely each was to pick that version. The count is <b>outright picks</b>: buyers whose top choice it was. They differ because a buyer leaning 40/35/25 contributes to all three percentages but is counted only once.`;

    renderHero(r, prev, idx, rounds.length);
    renderExplain(r, prev);
    renderPitches(r);

    $("#segments").innerHTML = r.segments.map((s) => `
      <div class="seg"><h3>${esc(s)}</h3><div class="people">
        ${r.customers.filter((c) => c.segment === s).map((c, k) => {
          const undecided = isTossup(c);
          return `<button class="person" data-p="${c.id}" aria-expanded="${open === c.id}">
            <span class="token ${undecided ? "undecided" : ""}" style="--tc:${animate ? "#3A3934" : color(c.purchase)};--tt:${inkOn(c.purchase) ? "var(--ink)" : "#fff"};--d:${k * 120 + r.segments.indexOf(s) * 60}ms" data-final="${color(c.purchase)}">${personaIcon(c)}</span>
            <span><span class="pname">${esc(c.name)}</span>${undecided ? `<span class="tag">Too close to call</span>` : ""}
            <span class="pchoice" style="display:block">Bought ${esc(nameOf(c.purchase))}</span>
            <span class="conf" aria-label="Confidence ${pct(c.confidence)}"><i style="width:${pct(c.confidence)}"></i></span></span>
          </button>`;
        }).join("")}</div></div>`).join("");
    if (animate) requestAnimationFrame(() => requestAnimationFrame(() =>
      document.querySelectorAll(".token").forEach((t) => t.style.setProperty("--tc", t.dataset.final))));

    $("#funnels").innerHTML = r.brands.map((b, i) => {
      const { worst, gap } = biggestDrop(b);
      return `<div class="funnel" style="--c:${COLORS[r.slots[i]]}"><h3><span class="sw" style="background:var(--c)"></span>${esc(b.brand)}</h3>
        ${STAGES.map(([k, lab]) => `<div class="frow"><span class="flab">${stageIcon(k)}${lab}</span><span class="track"><i style="width:${pct(b.funnel[k])}"></i></span><span class="num">${pct(b.funnel[k])}</span></div>`).join("")}
        <p class="drop">Biggest drop: ${STAGES[worst - 1][1].toLowerCase()} → ${STAGES[worst][1].toLowerCase()} (${Math.round(gap * 100)} pts).</p></div>`;
    }).join("");

    const heat = (v, c) => `background:color-mix(in srgb, ${c} ${Math.round(v * 85)}%, transparent);color:${v > .55 ? "#fff" : "var(--ink)"}`;
    $("#heatKey").innerHTML = heatKey("share", "share of that segment");
    $("#heat").innerHTML = `<thead><tr><th scope="col">Segment</th>${r.brands.map((b) => `<th scope="col">${esc(b.brand)}</th>`).join("")}<th scope="col">Bought nothing</th></tr></thead><tbody>` +
      r.segments.map((s) => `<tr><th scope="row">${esc(s)}</th>${r.brands.map((b, i) => `<td class="cell num" style="${heat(b.bySegment[s], HEX[r.slots[i]])}">${pct(b.bySegment[s])}</td>`).join("")}<td class="cell num" style="${heat(r.noPurchase.bySegment[s], "#8E8A7B")}">${pct(r.noPurchase.bySegment[s])}</td></tr>`).join("") + "</tbody>";

    const brandIds = r.brands.map((b) => b.id);
    $("#segInsights").innerHTML = `<ul class="seginsights">` + r.segments.map((s) => {
      const segCustomers = r.customers.filter((c) => c.segment === s);
      const counts = {};
      segCustomers.forEach((c) => brandIds.forEach((id) => { const o = c.byBrand[id].objection; if (o !== "none") counts[o] = (counts[o] || 0) + 1; }));
      const top = Object.entries(counts).sort((a, b2) => b2[1] - a[1])[0];
      return top ? `<li><b>${esc(s)}</b> — mostly held back by ${objectionIcon(top[0])} ${OBJ_NOUN[top[0]]}</li>` : "";
    }).join("") + `</ul>`;

    const objHeat = (v) => `background:color-mix(in srgb, var(--bad) ${Math.round(v * 85)}%, transparent);color:${v > .55 ? "#fff" : "var(--ink)"}`;
    $("#objections").innerHTML = `<div class="tablewrap"><table class="heat"><thead><tr><th scope="col">Objection</th>${r.brands.map((b) => `<th scope="col">${esc(b.brand)}</th>`).join("")}</tr></thead><tbody>` +
      OBJ_ORDER.map((k) => `<tr><th scope="row">${objectionIcon(k)} ${cap(OBJ_LABEL[k])}</th>${r.brands.map((b) => `<td class="cell num" style="${objHeat(b.objections[k])}">${pct(b.objections[k])}</td>`).join("")}</tr>`).join("") +
      `</tbody></table></div>` + heatKey("obj", "share of buyers citing it") +
      r.brands.map((b) => {
        const [topK, topV] = topObjection(b);
        return `<p class="objsum"><b>${esc(b.brand)}</b>'s top blocker: ${objectionIcon(topK)} <b class="num">${pct(topV)}</b> cite ${OBJ_NOUN[topK]}.</p>`;
      }).join("");

    renderSuggestions(r);
    renderChanges(r, prev);
    renderDeltas(r, prev);
    showDetail();
    renderHistory(rounds, idx);
    numberSections();
    $("#meta").textContent = `${r.model}, ${r.tokens.toLocaleString()} tokens, ${(r.ms / 1000).toFixed(1)}s`;
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
    const swatch = (v) => `background:color-mix(in srgb, ${kind === "obj" ? "var(--bad)" : "var(--ink)"} ${Math.round(v * 85)}%, transparent)`;
    return `<div class="heatkey"><span class="num">0%</span>${[0, .25, .5, .75, 1].map((v) => `<i style="${swatch(v)}"></i>`).join("")}<span class="num">100%</span><span class="hk-note">${note}</span></div>`;
  }

  function biggestDrop(b) {
    const vals = STAGES.map(([k]) => b.funnel[k]);
    let worst = 1, gap = -1;
    for (let j = 1; j < vals.length; j++) if (vals[j - 1] - vals[j] > gap) { gap = vals[j - 1] - vals[j]; worst = j; }
    return { worst, gap };
  }
  const topObjection = (b) => Object.entries(b.objections).filter(([k]) => k !== "none").sort((a, c) => c[1] - a[1])[0];

  // The ads themselves, shown as cards, so the report says what produced the numbers.
  function renderPitches(r) {
    $("#pitchSec").classList.remove("hidden");
    const maxShare = Math.max(...r.brands.map((b) => b.share));
    $("#pitches").innerHTML = r.brands.map((b, i) => `
      <div class="pitch ${b.share === maxShare ? "lead" : ""}" style="--c:${COLORS[r.slots[i]]}">
        <div class="pitch-top"><span class="sw" style="background:var(--c)"></span><b>${esc(b.brand)}</b>${b.share === maxShare ? `<span class="pitch-lead">LEADING</span>` : ""}</div>
        <h4>${esc(b.headline)}</h4>
        <p>${esc(b.valueProp)}</p>
        <div class="pitch-bottom"><span class="pitch-price num">${esc(b.price)}</span><span class="pitch-share num">${pct(b.share)}</span></div>
      </div>`).join("");
  }

  function renderSuggestions(r) {
    $("#suggestSec").classList.remove("hidden");
    const maxShare = Math.max(...r.brands.map((b) => b.share));
    $("#suggestions").innerHTML = r.brands.map((b, i) => {
      const { worst, gap } = biggestDrop(b);
      const dropFrom = STAGES[worst - 1][1].toLowerCase(), dropTo = STAGES[worst][1].toLowerCase();
      const [topK, topV] = topObjection(b);
      const body = b.share === maxShare
        ? `Leading the round at ${pct(b.share)}, but ${pct(topV)} of buyers still cite ${OBJ_NOUN[topK]}. Worth testing a fix before it costs share.`
        : `Biggest drop is ${dropFrom} → ${dropTo} (${Math.round(gap * 100)} pts), and the top objection is ${OBJ_NOUN[topK]} (${pct(topV)}). Try testing ${OBJ_FIX[topK]} next round.`;
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
      <div class="deltarow">${personaIcon(c, 20)}<span class="dname">${esc(c.name)}</span>
        <span class="dmove"><span class="dfrom">${esc(from)}</span><span class="darrow">→</span><span class="dto">${esc(to)}</span></span>
        ${appeal != null ? `<span class="dappeal num">${pct(appeal)} appeal</span>` : ""}
      </div>`).join("");
  }

  function renderRoundTabs(rounds, idx) {
    const tabs = $("#roundTabs");
    if (!tabs) return;
    tabs.classList.toggle("hidden", rounds.length < 2);
    tabs.innerHTML = rounds.length < 2 ? "" : `<span class="rt-label">Round</span>` + rounds.map((_, i) =>
      `<button class="rtab ${i === idx ? "active" : ""}" data-round="${i}" aria-current="${i === idx}">${i + 1}</button>`).join("");
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
    [0, .25, .5, .75, 1].filter((v) => v <= max).forEach((v) => svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#D9D3C2"/><text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end">${pct(v)}</text>`);
    if (idx != null) svg += `<line x1="${x(idx)}" x2="${x(idx)}" y1="${P.t}" y2="${H - P.b}" stroke="#151515" stroke-width="1.5" stroke-dasharray="4 4"/>`;
    R.forEach((_, i) => svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" style="${i === idx ? "font-weight:700;fill:#151515" : ""}">R${i + 1}</text>`);
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

  // Sections come and go with the round (no diff on round one, no switchers if
  // nobody moved), so their numbers and their light/dark banding are worked out
  // from the ones actually on screen rather than baked into the markup.
  function numberSections() {
    const shown = [...document.querySelectorAll("#results .rsec")].filter((s) => !s.classList.contains("hidden"));
    shown.forEach((s, i) => {
      const num = s.querySelector(".rsec-num");
      if (num) num.textContent = String(i + 1);
      s.classList.toggle("alt", i % 2 === 1);
    });
    // Nav entries for sections this round doesn't have would scroll to nothing.
    document.querySelectorAll("#reportNav a").forEach((a) => {
      const target = document.querySelector(a.getAttribute("href"));
      a.classList.toggle("hidden", !target || target.classList.contains("hidden"));
    });
  }

  // Highlights the report-nav link for whichever section is currently on screen.
  function watchSections() {
    const nav = $("#reportNav");
    if (!nav || !("IntersectionObserver" in window)) return;
    const links = [...nav.querySelectorAll("a")];
    const setActive = (href) => links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === href));
    // Two sections sit side by side on a wide screen, so a click has to win over
    // the observer until the scroll it triggered has settled.
    let clickedUntil = 0;
    nav.addEventListener("click", (e) => {
      const a = e.target.closest("a"); if (!a) return;
      clickedUntil = Date.now() + 900;
      setActive(a.getAttribute("href"));
    });
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.intersectionRatio));
      if (Date.now() < clickedUntil) return;
      let bestId = null, best = 0;
      seen.forEach((ratio, id) => { if (ratio > best) { best = ratio; bestId = id; } });
      if (bestId) setActive("#" + bestId);
    }, { threshold: [0, .15, .4, .75] });
    links.forEach((a) => { const el = document.querySelector(a.getAttribute("href")); if (el) io.observe(el); });
  }

  function attachHandlers(getRoundsFn) {
    getRounds = getRoundsFn;
    $("#detail").addEventListener("click", (e) => { if (e.target.id === "closeDetail") { open = null; showDetail(); } });
    $("#segments").addEventListener("click", (e) => {
      const btn = e.target.closest(".person"); if (!btn) return;
      open = open === btn.dataset.p ? null : btn.dataset.p;
      showDetail();
    });
    if (has("#roundTabs")) $("#roundTabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-round]"); if (!btn) return;
      open = null;
      renderResults(getRounds(), false, +btn.dataset.round);
    });
    watchSections();
  }
  function resetOpen() { open = null; viewIndex = null; }

  return { renderResults, renderHistory, attachHandlers, resetOpen, showSkeleton };
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
