// Rendering engine shared by Facilitate, Practice and the read-only shared view.
// Every page ships the same report markup (#results, #reportBar/#roundTabs/#reportNav,
// #sharebar, #legend, #pitches, #segments, #detail, #funnels, #heat, #objections,
// #suggestions, #changes, #deltas, #history, #meta) and keeps its own `rounds`
// array; this module owns which round is on screen and only touches those ids.
import { personaIcon, objectionIcon, stageIcon } from "./icons.js";

export const COLORS = ["var(--b1)", "var(--b2)", "var(--b3)", "var(--b4)"];
export const INK_ON = [false, false, false, true]; // text colour on each contender swatch
export const HEX = ["#2F4BD1", "#9A3F7A", "#1E7F72", "#D9A21B"];
export const STAGES = [["attention", "Noticed"], ["interest", "Interested"], ["belief", "Believed"], ["purchase", "Bought"]];
// The same four stages said out loud, for the written summary.
const STAGE_PLAIN = { attention: "getting noticed", interest: "sounding appealing", belief: "being believed", purchase: "closing the choice" };
export const OBJ_LABEL = { price: "price feels too high", trust: "doesn't believe the claims", relevance: "doesn't fit their needs or habits", unclear: "doesn't understand the offer", none: "no real objection" };
export const OBJ_ORDER = ["price", "trust", "relevance", "unclear"];
export const OBJ_FIX = { price: "the price or how it's framed", trust: "proof or credibility behind the claim", relevance: "who the message is speaking to", unclear: "how clearly the offer is explained" };
// Which contender fields the round-over-round diff compares, in display order.
const DIFF_FIELDS = [["brand", "Name"], ["headline", "Headline"], ["valueProp", "Value proposition"], ["price", "Price"]];

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pct = (x) => Math.round(x * 100) + "%";
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const $ = (s) => document.querySelector(s);
const has = (s) => Boolean(document.querySelector(s));

export function createResultsView() {
  let open = null;
  let viewIndex = null; // null means "whatever the latest round is"
  let getRounds = () => [];

  const indexFor = (rounds) => viewIndex == null ? rounds.length - 1 : Math.min(Math.max(viewIndex, 0), rounds.length - 1);
  const viewedRound = () => { const rounds = getRounds(); return rounds.length ? rounds[indexFor(rounds)] : null; };

  function deltaChip(now, before) {
    if (before == null) return "";
    const d = Math.round((now - before) * 100);
    if (d === 0) return `<span class="delta flat">±0</span>`;
    return `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${Math.abs(d)} pts</span>`;
  }
  // Contenders are matched across rounds by slot, not by id: ids are positional
  // per round, so adding or removing one mid-session would otherwise silently
  // compare two different contenders.
  const bySlot = (round, slot) => { const i = round.slots.indexOf(slot); return i < 0 ? null : round.brands[i]; };

  function detailHtml(c, r) {
    return `<button class="x" id="closeDetail">Close</button><h3>${esc(c.name)}, ${esc(c.segment.toLowerCase())}</h3><p>${esc(c.profile)}</p><div class="tablewrap"><table><thead><tr><th>Contender</th><th class="n">Noticed</th><th class="n">Interested</th><th class="n">Believed</th><th class="n">Would buy</th><th>Main objection</th></tr></thead><tbody>` +
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

  // index: omit to show the latest round, or pass one to view an earlier round.
  function renderResults(rounds, animate, index) {
    viewIndex = index == null ? null : index;
    const idx = indexFor(rounds);
    const r = rounds[idx];
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
      <span class="pct num">${pct(b.share)}</span>${deltaChip(b.share, prev ? bySlot(prev, r.slots[i])?.share : null)}</div>`).join("") +
      `<div class="none-entry"><span class="sw" style="background:repeating-linear-gradient(135deg,#3A3934 0 3px,#8E8A7B 3px 6px)"></span><span>Bought nothing</span><span class="pct num">${pct(r.noPurchase.share)}</span></div>`;

    renderExplain(r, prev);
    renderPitches(r);

    $("#segments").innerHTML = r.segments.map((s) => `
      <div class="seg"><h3>${esc(s)}</h3><div class="people">
        ${r.customers.filter((c) => c.segment === s).map((c, k) => {
          const undecided = c.confidence < .5;
          return `<button class="person" data-p="${c.id}" aria-expanded="${open === c.id}">
            <span class="token ${undecided ? "undecided" : ""}" style="--tc:${animate ? "#3A3934" : color(c.purchase)};--tt:${inkOn(c.purchase) ? "var(--ink)" : "#fff"};--d:${k * 120 + r.segments.indexOf(s) * 60}ms" data-final="${color(c.purchase)}">${personaIcon(c)}</span>
            <span><span class="pname">${esc(c.name)}</span>${undecided ? `<span class="tag">Undecided</span>` : ""}
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
      return top ? `<li><b>${esc(s)}</b> — mostly held back by ${objectionIcon(top[0])} ${OBJ_LABEL[top[0]]}</li>` : "";
    }).join("") + `</ul>`;

    const objHeat = (v) => `background:color-mix(in srgb, var(--bad) ${Math.round(v * 85)}%, transparent);color:${v > .55 ? "#fff" : "var(--ink)"}`;
    $("#objections").innerHTML = `<div class="tablewrap"><table class="heat"><thead><tr><th scope="col">Objection</th>${r.brands.map((b) => `<th scope="col">${esc(b.brand)}</th>`).join("")}</tr></thead><tbody>` +
      OBJ_ORDER.map((k) => `<tr><th scope="row">${objectionIcon(k)} ${cap(OBJ_LABEL[k])}</th>${r.brands.map((b) => `<td class="cell num" style="${objHeat(b.objections[k])}">${pct(b.objections[k])}</td>`).join("")}</tr>`).join("") +
      `</tbody></table></div>` + heatKey("obj", "share of buyers citing it") +
      r.brands.map((b) => {
        const [topK, topV] = topObjection(b);
        return `<p class="objsum"><b>${esc(b.brand)}</b>'s top blocker: ${objectionIcon(topK)} <b class="num">${pct(topV)}</b> ${OBJ_LABEL[topK]}.</p>`;
      }).join("");

    renderSuggestions(r);
    renderChanges(r, prev);
    renderDeltas(r, prev);
    showDetail();
    renderHistory(rounds, idx);
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

    if (gapPts < 5)
      lines.push(`<b>${esc(win.brand)}</b> and <b>${esc(second.brand)}</b> finished level — ${pct(win.share)} against ${pct(second.share)}. Across ${n} buyers a gap that small isn't a result you can act on; treat it as a tie.`);
    else
      lines.push(`<b>${esc(win.brand)}</b> won this round with ${pct(win.share)} of buyer choices, ${gapPts} points clear of ${esc(second.brand)} on ${pct(second.share)}.`);

    if (r.noPurchase.share >= .05) lines.push(`${pct(r.noPurchase.share)} of the panel bought nothing at all.`);

    // The final stage is the share itself, so comparing it would just restate the
    // first line; the useful question is where upstream the two separated.
    const edge = STAGES.filter(([k]) => k !== "purchase").map(([k]) => [k, win.funnel[k] - second.funnel[k]]).sort((a, b) => b[1] - a[1])[0];
    if (edge[1] > .03)
      lines.push(`<b>${esc(win.brand)}</b>'s clearest advantage was in ${STAGE_PLAIN[edge[0]]}: ${pct(win.funnel[edge[0]])} against ${esc(second.brand)}'s ${pct(second.funnel[edge[0]])}.`);

    const worstObj = OBJ_ORDER.map((k) => [k, r.brands.reduce((s, b) => s + b.objections[k], 0) / r.brands.length]).sort((a, b) => b[1] - a[1])[0];
    lines.push(`The most common objection across every contender was that the ${OBJ_LABEL[worstObj[0]]} (${pct(worstObj[1])} on average).`);

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
        return { b, d, changed: DIFF_FIELDS.filter(([f]) => (before[f] || "") !== (b[f] || "")).map(([, label]) => label.toLowerCase()) };
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
        ? `Leading the round at ${pct(b.share)}, but ${pct(topV)} of buyers still cite ${OBJ_LABEL[topK]}. Worth testing a fix before it costs share.`
        : `Biggest drop is ${dropFrom} → ${dropTo} (${Math.round(gap * 100)} pts), and the top objection is ${OBJ_LABEL[topK]} (${pct(topV)}). Try testing ${OBJ_FIX[topK]} next round.`;
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
      const rows = DIFF_FIELDS.filter(([f]) => (before[f] || "") !== (b[f] || "")).map(([f, label]) => `
        <div class="change-row"><span class="cf">${label}</span>
          <span class="cwas">${esc(before[f] || "—")}</span>
          <span class="carrow">→</span>
          <span class="cnow">${esc(b[f] || "—")}</span></div>`).join("");
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
  const rows = [["round", "contender", "headline", "value_proposition", "price", "choice_share", "noticed", "interested", "believed", ...rounds[0].segments.map((s) => "share_" + s)]];
  rounds.forEach((r, i) => r.brands.forEach((b) => rows.push([i + 1, b.brand, b.headline, b.valueProp, b.price, b.share, b.funnel.attention, b.funnel.interest, b.funnel.belief, ...r.segments.map((s) => b.bySegment[s])])));
  const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}
