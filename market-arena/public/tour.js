// The homepage feature tour: a list on the left, a pastel stage on the right, and a
// short demo of the real screen for each feature, played by a pretend cursor at a
// pace you can follow. The list advances on its own once, while you're looking and
// not hovering; click any item, or Replay, and you're in charge from then on.
//
// With reduced motion nothing moves: each demo shows its finished state, and the
// list only changes when you pick an item.
//
// The last two demos use the real coffee rounds from the hero. The others show the
// screens with example content, and the note under the tour says so.

import { buyerFace } from "./icons.js";
import { ARENA } from "./arena-data.js";
import { IMG_IC } from "./creative-ui.js";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STOP = Symbol("stop");
const COLOR = { A: "var(--b1)", B: "var(--b2)", C: "var(--b3)", none: "#C9C9C4" };
const segs = [...new Set(ARENA.buyers.map((b) => b.segment))];
const person = (id) => { const b = ARENA.buyers.find((x) => x.id === id); return { ...b, segIndex: segs.indexOf(b.segment) }; };
const pct = (x) => Math.round(x * 100);

const CURSOR = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.2 19 12.4l-6.3 1.3 3.6 6.9-2.7 1.4-3.6-6.9L5 19.4Z" fill="#1C1C1F" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

/* ---- The demos ---------------------------------------------------------------
   Each is an async function of the stage kit: it fills the sheet, then acts it out.
   Every wait can throw STOP when the visitor moves on, which ends the demo quietly. */

async function briefDemo(k) {
  const finds = [
    ["price", "Price", "Plans over ₹600 a month get weighed against a café habit."],
    ["trust", "Trust", "“Freshly roasted” is doubted unless the roast date is printed."],
    ["pull", "Pull", "Home brewers want beans at the door within a week of roasting."],
  ];
  k.sheet(`<div class="td-card">
    <p class="td-kick">Step 1 · Market</p>
    <h4>Brief your buyers on the real market</h4>
    <p class="td-muted">We read research, news and reviews, and hand your buyers the strongest findings before they see a single ad.</p>
    <button class="td-btn" type="button" tabindex="-1" data-go>Research this market</button>
    <ul class="td-finds">${finds.map(([t, l, x]) => `<li hidden><span class="td-ob td-ob-${t}">${l}</span><span>${esc(x)}</span></li>`).join("")}</ul>
    <p class="td-foot" hidden>Every buyer reads these first. They lock in at round 1.</p>
  </div>`);
  const go = k.$("[data-go]");
  await k.wait(500);
  await k.click(go);
  go.classList.add("busy"); go.textContent = "Reading 38 sources…";
  await k.wait(1300);
  go.hidden = true;
  for (const li of k.$$(".td-finds li")) { k.show(li); await k.wait(420); }
  k.show(k.$(".td-foot"));
}

async function dataDemo(k) {
  const lines = ["“I'd pay more if I knew when it was roasted.”", "“₹700 a month is more than I spend at the café.”", "“I just want it at my door before I wake up.”"];
  const made = [{ p: person("b5"), line: 0 }, { p: person("b7"), line: 1 }];
  k.sheet(`<div class="td-card">
    <p class="td-lab">Your reviews, interview notes or survey answers</p>
    <div class="td-paper" data-paper><span class="td-ph">Paste them here</span>${lines.map((l, i) => `<p hidden data-l="${i}">${esc(l)}</p>`).join("")}</div>
    <button class="td-btn" type="button" tabindex="-1" data-go>Build buyers</button>
    <div class="td-buyers">${made.map(({ p, line }) => `<div class="td-buyer" hidden data-for="${line}">${buyerFace(p, p.segIndex, 34)}
      <span><b>${esc(p.name)}</b><span>${esc(p.segment)} · based on line ${line + 1}</span></span></div>`).join("")}</div>
  </div>`);
  const paper = k.$("[data-paper]"), go = k.$("[data-go]");
  await k.wait(400);
  await k.click(paper);
  k.$(".td-ph").hidden = true;
  k.$$("[data-l]").forEach((l) => k.show(l));
  paper.classList.add("flash");
  await k.wait(700);
  await k.click(go);
  go.classList.add("busy"); go.textContent = "Reading your notes…";
  await k.wait(1100);
  go.hidden = true;
  for (const b of k.$$(".td-buyer")) { k.show(b); await k.wait(350); }
  // Point at each buyer: the line they came from lights up.
  for (const b of k.$$(".td-buyer")) {
    await k.move(b);
    k.$$("[data-l]").forEach((l) => l.classList.toggle("lit", l.dataset.l === b.dataset.for));
    b.classList.add("lit");
    await k.wait(1000);
    b.classList.remove("lit");
  }
}

async function pageDemo(k) {
  const fields = [["Headline", "Just coffee. Nothing else.", "page’s words"], ["Value proposition", "Single-origin arabica, steeped 18 hours.", "page’s words"], ["Price", "Rs 150 a bottle", "condensed"]];
  k.sheet(`<div class="td-card">
    <p class="td-lab td-lab-ic">${LINK}Fill this version from a web page</p>
    <div class="td-row"><div class="td-input" data-url><span class="td-ph">yourbrand.com, or a competitor’s page</span></div><button class="td-btn" type="button" tabindex="-1" data-go>Read page</button></div>
    <div class="td-fields">${fields.map(([l, , t]) => `<div class="td-f"><span class="td-lab">${l} <em class="td-tag" hidden>${t}</em></span><div class="td-input" data-v></div></div>`).join("")}</div>
  </div>`);
  const url = k.$("[data-url]"), go = k.$("[data-go]");
  await k.wait(400);
  await k.click(url);
  k.$(".td-ph").remove();
  await k.type(url, "purebean.in/cold-brew");
  await k.wait(250);
  await k.click(go);
  go.classList.add("busy"); go.textContent = "Reading…";
  await k.wait(1000);
  go.classList.remove("busy"); go.textContent = "Read page";
  const outs = k.$$("[data-v]"), tags = k.$$(".td-tag");
  for (const [i, [, v]] of fields.entries()) { await k.type(outs[i], v, 18); k.show(tags[i]); await k.wait(200); }
}

async function imageDemo(k) {
  const reads = [["Words", "“Just coffee. Nothing else.” · Rs 150"], ["Shows", "A bottle of cold brew on ice"], ["Layout", "Headline on top, price in the corner"]];
  const ad = `<div class="td-ad"><b>Just coffee.</b><i class="td-bottle"></i><span>Rs 150</span></div>`;
  k.sheet(`<div class="td-card">
    <p class="td-lab td-lab-ic">${IMG_IC}Test the real image ad</p>
    <div class="td-drop" data-drop><span class="td-ph">Drop each version’s image here</span></div>
    <p class="td-reading" hidden>Reading the image…</p>
    <dl class="td-read">${reads.map(([a, b]) => `<div hidden><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl>
    <p class="td-foot" hidden>Buyers judge the whole ad, not just the copy.</p>
  </div>`, `<div class="td-float" data-thumb>${ad}</div>`);
  const drop = k.$("[data-drop]"), thumb = k.$("[data-thumb]");
  await k.wait(500);
  await k.drag(thumb, drop);
  thumb.hidden = true;
  drop.innerHTML = ad; drop.classList.add("full");
  k.show(k.$(".td-reading"));
  await k.wait(1200);
  k.$(".td-reading").hidden = true;
  for (const d of k.$$(".td-read > div")) { k.show(d); await k.wait(380); }
  k.show(k.$(".td-foot"));
}

// Real: round 1 of the coffee test, then round 2 with only A's price cut.
async function loopDemo(k) {
  const r1 = ARENA.round1.share, r2 = ARENA.round2.share;
  const bar = (v) => `<div class="td-bar" data-k="${v}" style="--c:${COLOR[v]}"><span class="td-bk"><i></i>${v}</span>
    <span class="td-track"><i style="width:${pct(r1[v])}%"></i></span><b>${pct(r1[v])}%</b><em class="td-delta" hidden></em></div>`;
  k.sheet(`<div class="td-card">
    <p class="td-lab" data-rlab>Round 1 · 12 buyers</p>
    <div class="td-bars">${["A", "B", "C"].map(bar).join("")}</div>
    <div class="td-edit"><span class="td-lab">Version A · Price</span><div class="td-input" data-price>₹699/mo</div><p class="td-was" hidden>was ₹699/mo</p></div>
    <button class="td-btn td-primary" type="button" tabindex="-1" data-go>Run round 2</button>
    <p class="td-foot" hidden>Two real rounds. Only A’s price changed between them.</p>
  </div>`);
  const price = k.$("[data-price]"), go = k.$("[data-go]");
  await k.wait(700);
  await k.click(price);
  price.classList.add("sel");
  await k.wait(350);
  price.classList.remove("sel"); price.textContent = "";
  await k.type(price, "₹549/mo");
  k.show(k.$(".td-was"));
  await k.wait(500);
  await k.click(go);
  go.classList.add("busy"); go.textContent = "12 buyers are reading…";
  await k.wait(1300);
  go.hidden = true;
  k.$("[data-rlab]").textContent = "Round 2 · 12 buyers";
  for (const v of ["A", "B", "C"]) {
    const row = k.$(`.td-bar[data-k="${v}"]`), d = pct(r2[v]) - pct(r1[v]);
    row.querySelector(".td-track i").style.width = `${pct(r2[v])}%`;
    row.querySelector("b").textContent = `${pct(r2[v])}%`;
    const em = row.querySelector(".td-delta");
    em.textContent = Math.abs(d) < 1 ? "same" : `${d > 0 ? "+" : "−"}${Math.abs(d)} pts`;
    em.classList.toggle("up", d >= 1); em.classList.toggle("down", d <= -1);
    k.show(em);
  }
  await k.wait(700);
  k.show(k.$(".td-foot"));
}

// Real: who picked what in round 1, first as one room, then split by group.
async function roomDemo(k) {
  const pick = (b) => ARENA.round1.decisions[b.id].choice;
  const people = ARENA.buyers.map((b) => person(b.id));
  const face = (p) => `<span class="td-face" data-id="${p.id}" style="--tc:#C9C9C4" title="${esc(p.name)}">${buyerFace(p, p.segIndex, 30, { tint: "currentColor" })}</span>`;
  const sum = (g) => {
    const ms = people.filter((p) => p.segment === g), c = {};
    ms.forEach((p) => { c[pick(p)] = (c[pick(p)] || 0) + 1; });
    const [top, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return n === ms.length ? `all ${n} chose ${top}` : `${n} of ${ms.length} ${top === "none" ? "walked away" : `chose ${top}`}`;
  };
  const counts = { A: 0, B: 0, C: 0, none: 0 };
  people.forEach((p) => counts[pick(p)]++);
  k.sheet(`<div class="td-card">
    <div class="td-seg"><button type="button" tabindex="-1" class="on" data-m="all">Everyone</button><button type="button" tabindex="-1" data-m="grp">By group</button></div>
    <div class="td-room" data-all>${people.map(face).join("")}</div>
    <div class="td-groups" data-grp hidden>${segs.map((g) => `<div class="td-g"><span class="td-gn">${esc(g)}</span><span class="td-gf" data-g="${esc(g)}"></span><span class="td-gs">${sum(g)}</span></div>`).join("")}</div>
    <p class="td-legend">${["A", "B", "C", "none"].map((v) => `<span><i style="background:${COLOR[v]}"></i>${v === "none" ? "Walked away" : v} ${counts[v]}</span>`).join("")}</p>
  </div>`);
  await k.wait(500);
  for (const p of people) { k.$(`.td-face[data-id="${p.id}"]`).style.setProperty("--tc", COLOR[pick(p)]); await k.wait(90); }
  await k.wait(600);
  const grpBtn = k.$('[data-m="grp"]');
  await k.click(grpBtn);
  k.$('[data-m="all"]').classList.remove("on"); grpBtn.classList.add("on");
  // Faces glide from the room into their group's row.
  const faces = k.$$(".td-face"), before = new Map(faces.map((f) => [f, f.getBoundingClientRect()]));
  k.$("[data-grp]").hidden = false;
  faces.forEach((f) => k.$(`[data-g="${CSS.escape(people.find((p) => p.id === f.dataset.id).segment)}"]`).append(f));
  k.$("[data-all]").hidden = true;
  if (!reduced()) faces.forEach((f, i) => {
    const a = before.get(f), b = f.getBoundingClientRect();
    f.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: "none" }], { duration: 650, delay: i * 25, easing: "cubic-bezier(.3,.7,.2,1)", fill: "backwards" });
  });
  await k.wait(900);
  for (const s of k.$$(".td-gs")) { k.show(s); await k.wait(300); }
}

const LINK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>';

export const FEATURES = [
  { key: "brief", tone: "buyers", title: "Brief your buyers", text: "They read what real people in your market think before they see your ads.", ms: 7200, demo: briefDemo },
  { key: "data", tone: "data", title: "Buyers from your own data", text: "Paste reviews or interview notes. Every buyer shows the lines they came from.", ms: 9400, demo: dataDemo },
  { key: "page", tone: "page", title: "Start from any web page", text: "Paste a link, yours or a rival's. The headline, promise and price fill in.", ms: 8600, demo: pageDemo },
  { key: "image", tone: "image", title: "Test the real image ad", text: "Buyers read the image itself: its words, what it shows and how it's laid out.", ms: 8000, demo: imageDemo },
  { key: "loop", tone: "round", title: "Change one thing, run again", text: "Rewrite the line that lost people. Round 2 shows what the change did.", ms: 9000, demo: loopDemo },
  { key: "room", tone: "room", title: "See who picked what", text: "Split the room by group. Each group often goes its own way.", ms: 8400, demo: roomDemo },
];

/* ---- The tour ------------------------------------------------------------------ */

export function featureTour(host) {
  host.classList.add("tour");
  host.innerHTML = `
    <div class="tour-list" role="tablist" aria-orientation="vertical" aria-label="Features">
      ${FEATURES.map((f, i) => `<button type="button" role="tab" class="tour-item" id="tour-t${i}" data-i="${i}" data-tone="${f.tone}"
          aria-selected="false" aria-controls="tourStage" tabindex="-1">
        <span class="ti-dot" aria-hidden="true"></span>
        <span class="ti-body"><b>${esc(f.title)}</b><span class="ti-text">${esc(f.text)}</span></span>
        <span class="ti-prog" aria-hidden="true"><i></i></span></button>`).join("")}
    </div>
    <div class="tour-stage" id="tourStage" role="tabpanel">
      <div class="ts-sheet"></div>
      <button type="button" class="ts-replay">${REPLAY}Replay</button>
      <span class="ts-cursor" aria-hidden="true">${CURSOR}</span>
    </div>`;
  const stage = host.querySelector(".tour-stage"), sheet = host.querySelector(".ts-sheet"), cur = host.querySelector(".ts-cursor");
  const tabs = [...host.querySelectorAll(".tour-item")];
  let token = 0, at = -1, auto = !reduced(), hover = false, inView = false, prog = null;
  let pos = { x: 0, y: 0 };

  const setCursor = (p) => { pos = p; cur.style.transform = `translate(${p.x}px, ${p.y}px)`; };
  const rest = () => setCursor({ x: stage.clientWidth - 60, y: stage.clientHeight - 56 });

  function kit(mine) {
    const alive = () => mine === token;
    const wait = (ms) => new Promise((res, rej) => {
      if (!alive()) return rej(STOP);
      if (reduced()) return res();
      setTimeout(() => (alive() ? res() : rej(STOP)), ms);
    });
    const $ = (s) => stage.querySelector(s), $$ = (s) => [...stage.querySelectorAll(s)];
    const centre = (el) => {
      const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
      return { x: r.left - s.left + Math.min(r.width * 0.5, 60), y: r.top - s.top + r.height * 0.55 };
    };
    async function move(el, extra = []) {
      if (!alive()) throw STOP;
      const to = centre(el);
      if (reduced()) return setCursor(to);
      const d = Math.hypot(to.x - pos.x, to.y - pos.y), ms = Math.min(1100, 380 + d * 1.1);
      const from = `translate(${pos.x}px, ${pos.y}px)`, end = `translate(${to.x}px, ${to.y}px)`;
      const anims = [cur.animate([{ transform: from }, { transform: end }], { duration: ms, easing: "cubic-bezier(.5,.05,.25,1)" }),
        ...extra.map(([node, dx, dy]) => node.animate([{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px)` }], { duration: ms, easing: "cubic-bezier(.5,.05,.25,1)", fill: "forwards" }))];
      setCursor(to);
      await Promise.all(anims.map((a) => a.finished.catch(() => {})));
      if (!alive()) throw STOP;
    }
    async function press() {
      if (reduced()) return;
      cur.animate([{ scale: 1 }, { scale: 0.82 }, { scale: 1 }], { duration: 260, easing: "ease-out" });
      const ring = document.createElement("span");
      ring.className = "ts-ring"; ring.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      stage.append(ring); setTimeout(() => ring.remove(), 600);
    }
    return {
      wait, $, $$, move,
      sheet(html, loose = "") { sheet.innerHTML = html; stage.querySelectorAll(".td-float").forEach((n) => n.remove()); if (loose) stage.insertAdjacentHTML("beforeend", loose); },
      show(el) {
        if (!el) return;
        el.hidden = false;
        if (!reduced()) el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.3,.7,.2,1)" });
      },
      async click(el) {
        await move(el); await press();
        el.classList.add("td-press"); await wait(170); el.classList.remove("td-press");
      },
      async type(el, text, ms = 55) {
        el.classList.add("typing");
        for (const ch of text) { el.textContent += ch; await wait(ms + Math.random() * ms * 0.6); }
        el.classList.remove("typing");
      },
      // Pick something up and carry it: the cursor and the thing travel together.
      async drag(el, target) {
        await move(el); await press(); await wait(200);
        const a = el.getBoundingClientRect(), b = target.getBoundingClientRect();
        el.classList.add("lifted");
        await move(target, [[el, b.left + b.width / 2 - (a.left + a.width / 2), b.top + b.height / 2 - (a.top + a.height / 2)]]);
        await press();
      },
    };
  }

  function select(i, { play = true } = {}) {
    token++;
    at = i;
    prog?.cancel(); prog = null;
    tabs.forEach((t, j) => {
      const on = j === i;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle("on", on);
      t.querySelector(".ti-prog i").style.transform = "scaleX(0)";
    });
    // On a phone the list is a row that scrolls sideways: keep the active one in it.
    const list = tabs[i].parentElement;
    if (list.scrollWidth > list.clientWidth) list.scrollTo({ left: tabs[i].offsetLeft - list.offsetLeft - 16, behavior: reduced() ? "auto" : "smooth" });
    stage.dataset.tone = FEATURES[i].tone;
    stage.setAttribute("aria-labelledby", tabs[i].id);
    stage.classList.toggle("auto", auto);
    rest();
    const mine = token, k = kit(mine);
    const done = FEATURES[i].demo(k).catch((e) => { if (e !== STOP) console.warn(e); throw STOP; });
    if (!play || !auto) return done.catch(() => {});
    // The progress line under the item fills while it plays; hovering the tour or
    // scrolling it away pauses the line, and the next item waits for both.
    prog = tabs[i].querySelector(".ti-prog i").animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: FEATURES[i].ms, fill: "forwards" });
    if (hover || !inView) prog.pause();
    Promise.all([done, prog.finished]).then(() => new Promise((r) => setTimeout(r, 900))).then(() => {
      if (mine !== token || !auto) return;
      if (i === FEATURES.length - 1) { auto = false; stage.classList.remove("auto"); return; } // once through, then it rests
      select(i + 1);
    }).catch(() => {});
  }
  const takeOver = () => { auto = false; stage.classList.remove("auto"); };
  tabs.forEach((t, i) => t.addEventListener("click", () => { takeOver(); select(i); }));
  host.querySelector(".tour-list").addEventListener("keydown", (e) => {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (e.key === "Home" || e.key === "End" || d) {
      e.preventDefault(); takeOver();
      const n = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (at + d + tabs.length) % tabs.length;
      select(n); tabs[n].focus();
    }
  });
  host.querySelector(".ts-replay").addEventListener("click", () => { takeOver(); select(at); });
  host.addEventListener("pointerenter", () => { hover = true; prog?.pause(); });
  host.addEventListener("pointerleave", () => { hover = false; if (inView) prog?.play(); });
  host.addEventListener("focusin", () => { hover = true; prog?.pause(); });
  host.addEventListener("focusout", (e) => { if (!host.contains(e.relatedTarget)) { hover = false; if (inView) prog?.play(); } });

  // Starts the first time it's properly on screen, not while you're still in the hero.
  let started = false;
  const io = new IntersectionObserver(([en]) => {
    inView = en.isIntersecting;
    if (inView && !started) { started = true; select(0); }
    else if (inView && !hover) prog?.play();
    else prog?.pause();
  }, { threshold: 0.4 });
  io.observe(host);
  if (!("IntersectionObserver" in window) || reduced()) { started = true; inView = true; select(0); }
  return { select };
}

const REPLAY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
