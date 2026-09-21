// Rendering engine shared by Facilitate and Practice mode. Both pages ship the
// same results markup (#results, #sharebar, #legend, #segments, #detail, #funnels,
// #heat, #objections, #historySec/#history, #meta) and each keeps its own
// `rounds` array; this module only reads/writes those fixed element ids.
import { personaIcon, objectionIcon, stageIcon } from "./icons.js";

export const COLORS = ["var(--b1)", "var(--b2)", "var(--b3)", "var(--b4)"];
export const INK_ON = [false, false, false, true]; // text colour on each brand swatch
export const HEX = ["#2F4BD1", "#9A3F7A", "#1E7F72", "#D9A21B"];
export const STAGES = [["attention", "Noticed"], ["interest", "Interested"], ["belief", "Believed"], ["purchase", "Bought"]];
export const OBJ_LABEL = { price: "price feels too high", trust: "doesn't believe the claims", relevance: "doesn't fit their needs or habits", unclear: "doesn't understand the offer", none: "no real objection" };
export const OBJ_ORDER = ["price", "trust", "relevance", "unclear"];
export const OBJ_FIX = { price: "the price or how it's framed", trust: "proof or credibility behind the claim", relevance: "who the message is speaking to", unclear: "how clearly the offer is explained" };

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pct = (x) => Math.round(x * 100) + "%";
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const $ = (s) => document.querySelector(s);

export function createResultsView() {
  let open = null;
  let getRounds = () => [];

  function prevShare(rounds, slot) {
    if (rounds.length < 2) return null;
    const prev = rounds[rounds.length - 2];
    const i = prev.slots.indexOf(slot);
    return i < 0 ? null : prev.brands[i].share;
  }
  function deltaChip(now, before) {
    if (before == null) return "";
    const d = Math.round((now - before) * 100);
    if (d === 0) return `<span class="delta flat">±0</span>`;
    return `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${Math.abs(d)} pts</span>`;
  }

  function detailHtml(c, r) {
    return `<button class="x" id="closeDetail">Close</button><h3>${esc(c.name)}, ${esc(c.segment.toLowerCase())}</h3><p>${esc(c.profile)}</p><div class="tablewrap"><table><thead><tr><th>Brand</th><th class="n">Noticed</th><th class="n">Interested</th><th class="n">Believed</th><th class="n">Would buy</th><th>Main objection</th></tr></thead><tbody>` +
      r.brands.map((b) => { const x = c.byBrand[b.id];
        return `<tr><td>${esc(b.brand)}</td><td class="num">${pct(x.attention)}</td><td class="num">${pct(x.appeal)}</td><td class="num">${pct(x.belief)}</td><td class="num">${pct(c.purchaseProbs[b.id] || 0)}</td><td>${OBJ_LABEL[x.objection]}</td></tr>`; }).join("") +
      `</tbody></table></div>`;
  }
  function showDetail() {
    const rounds = getRounds();
    const r = rounds[rounds.length - 1];
    const d = $("#detail");
    document.querySelectorAll(".person").forEach((x) => x.setAttribute("aria-expanded", String(x.dataset.p === open)));
    const c = r?.customers.find((x) => x.id === open);
    d.classList.toggle("hidden", !c);
    d.innerHTML = c ? detailHtml(c, r) : "";
  }

  function showSkeleton() {
    $("#results").classList.remove("hidden");
    $("#csv").disabled = true; $("#pdf").disabled = true; if ($("#share")) $("#share").disabled = true;
    $("#flags").innerHTML = "";
    $("#marketTitle").textContent = "Reading the room…";
    $("#sharebar").innerHTML = `<div class="skel" style="width:100%;height:100%;border-radius:0"></div>`;
    $("#legend").innerHTML = Array.from({ length: 3 }).map(() => `<i class="skel" style="width:110px;height:26px"></i>`).join("");
    $("#tested").innerHTML = "";
    $("#segments").innerHTML = Array.from({ length: 4 }).map(() => `
      <div class="seg"><i class="skel skel-head"></i><div class="people">
        ${Array.from({ length: 3 }).map(() => `<div class="skel-row"><i class="skel skel-token"></i><i class="skel skel-line"></i></div>`).join("")}
      </div></div>`).join("");
    $("#detail").classList.add("hidden");
    $("#funnels").innerHTML = ""; $("#heat").innerHTML = ""; $("#objections").innerHTML = ""; $("#segInsights").innerHTML = "";
    $("#suggestSec").classList.add("hidden"); $("#deltaSec").classList.add("hidden");
  }

  function renderResults(rounds, animate) {
    const r = rounds[rounds.length - 1];
    const n = rounds.length;
    $("#results").classList.remove("hidden");
    $("#csv").disabled = false; $("#pdf").disabled = false; if ($("#share")) $("#share").disabled = false;
    $("#marketTitle").textContent = `Round ${n}: the market decided`;
    const col = (id) => r.slots[r.brands.findIndex((b) => b.id === id)];
    const color = (id) => id === "none" ? "#3A3934" : COLORS[col(id)];
    const inkOn = (id) => id !== "none" && INK_ON[col(id)];
    const nameOf = (id) => id === "none" ? "nothing" : r.brands.find((b) => b.id === id).brand;

    $("#flags").innerHTML = r.brands.filter((b) => b.flagged).map((b) =>
      `<p class="flag"><b>${esc(b.brand)}</b>'s ad reads like it's talking to the judges, not to customers. Rewrite it as real marketing copy.</p>`).join("");

    const parts = [...r.brands.map((b, i) => ({ id: b.id, share: b.share, c: COLORS[r.slots[i]], ink: INK_ON[r.slots[i]] })),
                   { id: "none", share: r.noPurchase.share }];
    $("#sharebar").innerHTML = parts.map((p) =>
      `<div class="${p.id === "none" ? "none" : ""}" style="flex-grow:${animate ? 0.0001 : p.share};${p.c ? `background:${p.c};color:${p.ink ? "var(--ink)" : "#fff"}` : ""}">${p.share >= .07 ? pct(p.share) : ""}</div>`).join("");
    if (animate) requestAnimationFrame(() => requestAnimationFrame(() =>
      [...$("#sharebar").children].forEach((el, i) => el.style.flexGrow = parts[i].share)));

    $("#legend").innerHTML = r.brands.map((b, i) => `
      <div><span class="sw" style="background:${COLORS[r.slots[i]]}"></span><span>${esc(b.brand)}</span>
      <span class="pct">${pct(b.share)}</span>${deltaChip(b.share, prevShare(rounds, r.slots[i]))}</div>`).join("") +
      `<div><span class="sw" style="background:repeating-linear-gradient(135deg,#3A3934 0 3px,#8E8A7B 3px 6px)"></span><span>Bought nothing</span><span class="pct">${pct(r.noPurchase.share)}</span></div>`;

    $("#tested").innerHTML = r.brands.map((b, i) => `
      <div class="tcard" style="--c:${COLORS[r.slots[i]]}"><span class="sw" style="background:var(--c)"></span><b>${esc(b.brand)}</b>
      <span class="thead">${esc(b.headline)}</span><span class="tprice">${esc(b.price)}</span></div>`).join("");

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
      const vals = STAGES.map(([k]) => b.funnel[k]);
      let worst = 0, gap = -1;
      for (let j = 1; j < vals.length; j++) if (vals[j - 1] - vals[j] > gap) { gap = vals[j - 1] - vals[j]; worst = j; }
      return `<div class="funnel" style="--c:${COLORS[r.slots[i]]}"><h3><span class="sw" style="background:var(--c)"></span>${esc(b.brand)}</h3>
        ${STAGES.map(([k, lab]) => `<div class="frow"><span class="flab">${stageIcon(k)}${lab}</span><span class="track"><i style="width:${pct(b.funnel[k])}"></i></span><span class="num">${pct(b.funnel[k])}</span></div>`).join("")}
        <p class="drop">Biggest drop: ${STAGES[worst - 1][1].toLowerCase()} → ${STAGES[worst][1].toLowerCase()}.</p></div>`;
    }).join("");

    const heat = (v, c) => `background:color-mix(in srgb, ${c} ${Math.round(v * 85)}%, transparent);color:${v > .55 ? "#fff" : "var(--ink)"}`;
    $("#heat").innerHTML = `<thead><tr><th>Segment</th>${r.brands.map((b) => `<th>${esc(b.brand)}</th>`).join("")}<th>Nothing</th></tr></thead><tbody>` +
      r.segments.map((s) => `<tr><td>${esc(s)}</td>${r.brands.map((b, i) => `<td class="cell" style="${heat(b.bySegment[s], HEX[r.slots[i]])}">${pct(b.bySegment[s])}</td>`).join("")}<td class="cell" style="${heat(r.noPurchase.bySegment[s], "#8E8A7B")}">${pct(r.noPurchase.bySegment[s])}</td></tr>`).join("") + "</tbody>";

    const brandIds = r.brands.map((b) => b.id);
    $("#segInsights").innerHTML = `<ul class="seginsights">` + r.segments.map((s) => {
      const segCustomers = r.customers.filter((c) => c.segment === s);
      const counts = {};
      segCustomers.forEach((c) => brandIds.forEach((id) => { const o = c.byBrand[id].objection; if (o !== "none") counts[o] = (counts[o] || 0) + 1; }));
      const top = Object.entries(counts).sort((a, b2) => b2[1] - a[1])[0];
      return top ? `<li><b>${esc(s)}</b> — mostly held back by ${objectionIcon(top[0])} ${OBJ_LABEL[top[0]]}</li>` : "";
    }).join("") + `</ul>`;

    const objHeat = (v) => `background:color-mix(in srgb, var(--bad) ${Math.round(v * 85)}%, transparent);color:${v > .55 ? "#fff" : "var(--ink)"}`;
    $("#objections").innerHTML = `<div class="tablewrap"><table class="heat"><thead><tr><th>Objection</th>${r.brands.map((b) => `<th>${esc(b.brand)}</th>`).join("")}</tr></thead><tbody>` +
      OBJ_ORDER.map((k) => `<tr><td>${objectionIcon(k)} ${cap(OBJ_LABEL[k])}</td>${r.brands.map((b) => `<td class="cell" style="${objHeat(b.objections[k])}">${pct(b.objections[k])}</td>`).join("")}</tr>`).join("") +
      `</tbody></table></div>` +
      r.brands.map((b) => {
        const [topK, topV] = Object.entries(b.objections).filter(([k]) => k !== "none").sort((a, c) => c[1] - a[1])[0];
        return `<p class="objsum"><b>${esc(b.brand)}</b>'s top blocker: ${objectionIcon(topK)} <b>${pct(topV)}</b> ${OBJ_LABEL[topK]}.</p>`;
      }).join("");

    renderSuggestions(r);
    renderDeltas(rounds);
    showDetail();
    renderHistory(rounds);
    $("#meta").textContent = `${r.model}, ${r.tokens.toLocaleString()} tokens, ${(r.ms / 1000).toFixed(1)}s`;
  }

  function renderSuggestions(r) {
    $("#suggestSec").classList.remove("hidden");
    const maxShare = Math.max(...r.brands.map((b) => b.share));
    $("#suggestions").innerHTML = r.brands.map((b, i) => {
      const vals = STAGES.map(([k]) => b.funnel[k]);
      let worst = 0, gap = -1;
      for (let j = 1; j < vals.length; j++) if (vals[j - 1] - vals[j] > gap) { gap = vals[j - 1] - vals[j]; worst = j; }
      const dropFrom = STAGES[worst - 1][1].toLowerCase(), dropTo = STAGES[worst][1].toLowerCase();
      const [topK, topV] = Object.entries(b.objections).filter(([k]) => k !== "none").sort((a, c) => c[1] - a[1])[0];
      const leading = b.share === maxShare;
      const body = leading
        ? `Leading the round at ${pct(b.share)}, but ${pct(topV)} of customers still cite ${OBJ_LABEL[topK]}. Worth testing a fix before it costs share.`
        : `Biggest drop is ${dropFrom} → ${dropTo} (${Math.round(gap * 100)} pts), and the top objection is ${OBJ_LABEL[topK]} (${pct(topV)}). Try testing ${OBJ_FIX[topK]} next round.`;
      return `<div class="suggest" style="--c:${COLORS[r.slots[i]]}"><h3><span class="sw" style="background:var(--c)"></span>${esc(b.brand)}</h3><p>${body}</p></div>`;
    }).join("");
  }

  function choiceLabel(round, id) { if (id === "none") return "nothing"; const b = round.brands.find((x) => x.id === id); return b ? b.brand : id; }
  function choiceSlot(round, id) { if (id === "none") return -1; const i = round.brands.findIndex((x) => x.id === id); return i < 0 ? -1 : round.slots[i]; }

  function renderDeltas(rounds) {
    if (rounds.length < 2) { $("#deltaSec").classList.add("hidden"); return; }
    const prev = rounds[rounds.length - 2], curr = rounds[rounds.length - 1];
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
        ${appeal != null ? `<span class="dappeal">${pct(appeal)} appeal</span>` : ""}
      </div>`).join("");
  }

  function renderHistory(rounds) {
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
    R.forEach((_, i) => svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">R${i + 1}</text>`);
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

  function attachHandlers(getRoundsFn) {
    getRounds = getRoundsFn;
    $("#detail").addEventListener("click", (e) => { if (e.target.id === "closeDetail") { open = null; showDetail(); } });
    $("#segments").addEventListener("click", (e) => {
      const btn = e.target.closest(".person"); if (!btn) return;
      open = open === btn.dataset.p ? null : btn.dataset.p;
      showDetail();
    });
  }
  function resetOpen() { open = null; }

  return { renderResults, renderHistory, attachHandlers, resetOpen, showSkeleton };
}

export function exportCsv(rounds, filename) {
  const rows = [["round", "brand", "headline", "value_proposition", "price", "market_share", "noticed", "interested", "believed", ...rounds[0].segments.map((s) => "share_" + s)]];
  rounds.forEach((r, i) => r.brands.forEach((b) => rows.push([i + 1, b.brand, b.headline, b.valueProp, b.price, b.share, b.funnel.attention, b.funnel.interest, b.funnel.belief, ...r.segments.map((s) => b.bySegment[s])])));
  const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}
