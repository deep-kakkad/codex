// The Market Arena mark, assembled from a cloud of dots: the five seats of the half
// circle and the floor line, one seat in the brand orange. A crowd becoming a
// decision, which is the product in one picture.
//
// Dots drift in from wherever they start and settle onto the mark, each on its own
// spring and slightly out of step, so it reads as gathering rather than sliding.
// Near the cursor they scatter and come back. As a loader it can loop: gather, hold,
// scatter, gather. Drawn on one canvas; it stops drawing when off screen, and with
// reduced motion the mark is simply drawn in place.

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// The mark's geometry, on the logo's own 48-unit grid (see LOGO_MARK in icons.js).
const SEATS = [[7, 33], [12, 21], [24, 16], [36, 21], [41, 33]];
const ORANGE_SEAT = 3;
const SEAT_R = 5.2;
const FLOOR = { x: 4, y: 41.5, w: 40, h: 3 };

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Points evenly spread over the mark: a sunflower spiral inside each seat and rows
// along the floor, so the dots pack like a crowd rather than on a grid.
function targets(density) {
  const pts = [];
  SEATS.forEach(([cx, cy], s) => {
    const n = Math.round(density * 34);
    for (let i = 0; i < n; i++) {
      const r = SEAT_R * Math.sqrt((i + 0.5) / n), a = i * 2.39996;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), tone: s === ORANGE_SEAT ? "brand" : "ink" });
    }
  });
  const cols = Math.round(density * 34), rows = 2;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    pts.push({ x: FLOOR.x + (i + 0.5) * (FLOOR.w / cols), y: FLOOR.y + (j + 0.5) * (FLOOR.h / rows), tone: "floor" });
  }
  return pts;
}

/* host: an element to draw in. Options:
   size: the mark's height in px (it is square); loop: gather/scatter forever (a loader);
   start: "view" to wait until on screen, "now" to begin at once.
   Returns { replay(), dispose() }. */
export function particleMark(host, { size = 180, loop = false, start = "view", density = 1, spread = loop ? 0.2 : 0.55 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "pmark";
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const colors = { ink: cssVar("--ink", "#1C1C1F"), brand: cssVar("--brand-dot", "#FF5A36"), floor: cssVar("--ink", "#1C1C1F") };
  let W = 0, H = 0, scale = 1, ox = 0, oy = 0;
  const pts = targets(density).map((t, i) => ({ ...t, px: 0, py: 0, vx: 0, vy: 0, sx: 0, sy: 0, delay: loop ? Math.random() * 240 : Math.random() * 520 + (i % 7) * 18, r: 0.9 + Math.random() * 0.5 }));
  const pointer = { x: -1e4, y: -1e4 };
  let phase = "idle", t0 = 0, raf = 0, visible = false, holdUntil = 0;

  function layout() {
    const w = host.clientWidth || size * 1.6, h = host.clientHeight || size;
    W = w; H = h;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    scale = Math.min(size, h) / 48;
    ox = (w - 48 * scale) / 2; oy = (h - 48 * scale) / 2;
  }
  // Somewhere loose around the mark to start from: a wide, soft cloud.
  function scatter(p) {
    const a = Math.random() * Math.PI * 2, d = (0.55 + Math.random() * 0.75) * Math.max(W, H) * spread;
    p.sx = W / 2 + Math.cos(a) * d; p.sy = H / 2 + Math.sin(a) * d * 0.6;
  }
  const home = (p) => [ox + p.x * scale, oy + p.y * scale];

  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      ctx.globalAlpha = p.tone === "floor" ? 0.38 : 1;
      ctx.fillStyle = colors[p.tone];
      ctx.beginPath();
      ctx.arc(p.px, p.py, p.r * Math.max(1, scale * 0.38), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function settleStatic() { layout(); pts.forEach((p) => { [p.px, p.py] = home(p); }); draw(); }

  function gather(now) {
    phase = "gather"; t0 = now;
    pts.forEach((p) => { scatter(p); p.px = p.sx; p.py = p.sy; p.vx = p.vy = 0; });
  }
  // The loop only runs while something moves: when the mark has settled and the
  // cursor is away, it stops, and a cursor coming near starts it again.
  let running = false, calm = 0;
  const kick = () => { if (!running && visible) { running = true; raf = requestAnimationFrame(frame); } };
  function frame(now) {
    if (!visible) { running = false; return; }
    raf = requestAnimationFrame(frame);
    const el = now - t0;
    let settled = true;
    for (const p of pts) {
      let [tx, ty] = home(p);
      if (phase === "scatter") { tx = p.sx; ty = p.sy; }
      else if (el < p.delay) { tx = p.px; ty = p.py; }
      // A soft spring home, plus a push away from the cursor.
      let ax = (tx - p.px) * 0.055, ay = (ty - p.py) * 0.055;
      const dx = p.px - pointer.x, dy = p.py - pointer.y, d2 = dx * dx + dy * dy, R = 46;
      if (d2 < R * R) { const f = (1 - Math.sqrt(d2) / R) * 2.4; ax += (dx / (Math.sqrt(d2) + 0.01)) * f; ay += (dy / (Math.sqrt(d2) + 0.01)) * f; }
      p.vx = (p.vx + ax) * 0.82; p.vy = (p.vy + ay) * 0.82;
      p.px += p.vx; p.py += p.vy;
      if (Math.abs(tx - p.px) + Math.abs(ty - p.py) > 0.4 || Math.abs(p.vx) + Math.abs(p.vy) > 0.05) settled = false;
    }
    draw(now);
    if (!loop && phase === "gather" && settled && pointer.x < -1e3) { if (++calm > 20) { cancelAnimationFrame(raf); running = false; calm = 0; } } else calm = 0;
    if (loop) {
      if (phase === "gather" && settled && !holdUntil) holdUntil = now + 1100;
      if (holdUntil && now > holdUntil && phase === "gather") { phase = "scatter"; t0 = now; holdUntil = 0; pts.forEach(scatter); }
      else if (phase === "scatter" && now - t0 > 700) gather(now);
    }
  }

  const onMove = (e) => { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; kick(); };
  const onLeave = () => { pointer.x = pointer.y = -1e4; kick(); };
  const ro = new ResizeObserver(() => { layout(); if (reduced()) settleStatic(); });
  ro.observe(host);
  layout();

  if (reduced()) { settleStatic(); return { replay() {}, dispose() { ro.disconnect(); canvas.remove(); } }; }

  host.addEventListener("pointermove", onMove, { passive: true });
  host.addEventListener("pointerleave", onLeave);
  let started = false;
  const begin = () => { if (started) return; started = true; gather(performance.now()); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { if (start === "view") begin(); kick(); } });
  io.observe(host);
  if (start === "now") { visible = true; begin(); kick(); }
  return {
    replay() { gather(performance.now()); kick(); },
    dispose() { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); host.removeEventListener("pointermove", onMove); host.removeEventListener("pointerleave", onLeave); canvas.remove(); },
  };
}
