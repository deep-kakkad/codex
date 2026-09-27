// A small burst of the logo's dots: ink, the brand orange, and the winner's colour.
// Used once, when a version you changed wins the next round by a clear margin. It
// draws on one canvas over the page, is gone in about a second, never blocks a
// click, and does nothing at all with reduced motion.
export function burst(x, y, { colors = ["#1C1C1F", "#FF5A36"], count = 34 } = {}) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  Object.assign(c.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 96 });
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  c.setAttribute("aria-hidden", "true");
  document.body.append(c);
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  const dots = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4, v = 3.2 + Math.random() * 4.2;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.2, r: 2.4 + Math.random() * 2.6, c: colors[i % colors.length] };
  });
  const t0 = performance.now(), LIFE = 1100;
  const frame = (now) => {
    const t = (now - t0) / LIFE;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (t >= 1) { c.remove(); return; }
    for (const d of dots) {
      d.vx *= 0.965; d.vy = d.vy * 0.965 + 0.16;
      d.x += d.vx; d.y += d.vy;
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = d.c;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (1 - t * 0.4), 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
